import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { matchLga, matchState } from '../lib/area';
import { fetchAreaFeed, type AreaRef, type FeedRow } from '../lib/feed';
import { supabase } from '../lib/supabase';

/**
 * Resolves the user's state/LGA from the device, then reads the ranked feed.
 *
 * Denied permission is a normal path, not an error: the previous AI spec
 * shipped a bug where a location-less user was walled out entirely. Here, no
 * location simply means the national feed.
 */
export function useSafetyFeed(limit = 20) {
  const [items, setItems]             = useState<FeedRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [isNationalOnly, setNational] = useState(false);

  const area = useRef<AreaRef>({ stateCode: null, lgaCode: null, lat: null, lng: null });

  const resolveArea = useCallback(async () => {
    // Every fallback is logged: they used to be silent, which hid the fact that
    // no user in production had ever resolved to a state.
    const national = (reason: string, detail?: unknown) => {
      console.warn(`[feed] national fallback: ${reason}`, detail ?? '');
      setNational(true);
    };

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      // Users who skipped onboarding were never asked; ask once here. A denial
      // stays a denial — the OS will not re-prompt and we do not nag.
      if (status === 'undetermined') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') { national('permission', status); return; }

      const pos = (await Location.getLastKnownPositionAsync())
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!pos) { national('no position'); return; }

      // Record coordinates before reverse-geocoding: community incidents match
      // by distance, so they still work even if the state lookup fails.
      area.current.lat = pos.coords.latitude;
      area.current.lng = pos.coords.longitude;

      const [place] = await Location.reverseGeocodeAsync({
        latitude : pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (!place) { national('no geocode result'); return; }

      // Match in JS rather than with ilike: geocoder names vary ("Lagos State",
      // "Abuja", "FCT") and need the same normalisation the server uses.
      const { data: states, error: statesErr } = await supabase
        .from('ng_states').select('code, name');
      if (statesErr || !states) { national('state list', statesErr); return; }

      // Some geocoders leave region empty but put the state in city
      // (e.g. "Lagos", "Abuja"), so try that before giving up.
      const stateCode = matchState(place.region, states) ?? matchState(place.city, states);
      if (!stateCode) { national('unmatched region', { region: place.region, city: place.city }); return; }

      area.current.stateCode = stateCode;
      setNational(false);

      area.current.lgaCode = null;
      if (place.subregion) {
        const { data: lgas } = await supabase
          .from('ng_lgas').select('code, name').eq('state_code', stateCode);
        area.current.lgaCode = matchLga(place.subregion, lgas ?? []);
        if (!area.current.lgaCode) {
          console.warn('[feed] unmatched LGA', { state: stateCode, subregion: place.subregion });
        }
      }

      // Persist the area so the push notifier knows who is in this LGA.
      // getSession(), never getUser() — this project has been bitten by that.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        void supabase.from('profiles').update({
          last_state_code: area.current.stateCode,
          last_lga_code  : area.current.lgaCode,
          area_updated_at: new Date().toISOString(),
        }).eq('id', session.user.id).then(({ error: upErr }) => {
          if (upErr) console.warn('[feed] could not save area to profile', upErr);
        });
      }
    } catch (e) {
      // Any geo failure degrades to the national feed rather than an error state.
      national('exception', e);
    }
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await fetchAreaFeed(area.current, limit);
      setItems(rows);
      setError(null);
    } catch (e) {
      // Keep whatever is already on screen; a safety feed must not go blank.
      setError(e instanceof Error ? e.message : 'Could not load the feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [limit]);

  const refresh = useCallback(async () => {
    await resolveArea();
    await load('refresh');
  }, [resolveArea, load]);

  const loadMore = useCallback(async () => {
    if (items.length === 0) return;
    const before = items[items.length - 1].occurred_at;
    try {
      const more = await fetchAreaFeed(area.current, limit, before);
      if (more.length > 0) setItems((prev) => [...prev, ...more]);
    } catch {
      // Keep the current page.
    }
  }, [items, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await resolveArea();
      if (!cancelled) await load('initial');
    })();

    // Debounce the realtime reload — enrich-news can write multiple rows in quick
    // succession; without debounce each INSERT fires a separate reload which
    // slams slow connections and noticeably stutters the UI.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { void load('refresh'); }, 2000);
    };

    const channel = supabase
      .channel('news_items_feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        debouncedReload)
      .subscribe();

    return () => {
      cancelled = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      void supabase.removeChannel(channel);
    };
  }, [resolveArea, load]);

  return { items, loading, refreshing, isNationalOnly, error, refresh, loadMore };
}
