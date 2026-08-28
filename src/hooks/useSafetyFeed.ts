import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
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
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') { setNational(true); return; }

      const pos = (await Location.getLastKnownPositionAsync())
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!pos) { setNational(true); return; }

      // Record coordinates before reverse-geocoding: community incidents match
      // by distance, so they still work even if the state lookup fails.
      area.current.lat = pos.coords.latitude;
      area.current.lng = pos.coords.longitude;

      const [place] = await Location.reverseGeocodeAsync({
        latitude : pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (!place?.region) { setNational(true); return; }

      const { data } = await supabase
        .from('ng_states').select('code').ilike('name', place.region).maybeSingle();
      if (!data?.code) { setNational(true); return; }

      area.current.stateCode = data.code;
      setNational(false);

      if (place.subregion) {
        const { data: lga } = await supabase
          .from('ng_lgas').select('code')
          .eq('state_code', data.code).ilike('name', place.subregion).maybeSingle();
        area.current.lgaCode = lga?.code ?? null;
      }

      // Persist the area so the push notifier knows who is in this LGA.
      // getSession(), never getUser() — this project has been bitten by that.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        void supabase.from('profiles').update({
          last_state_code: area.current.stateCode,
          last_lga_code  : area.current.lgaCode,
          area_updated_at: new Date().toISOString(),
        }).eq('id', session.user.id);
      }
    } catch {
      // Any geo failure degrades to the national feed rather than an error state.
      setNational(true);
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

    const channel = supabase
      .channel('news_items_feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        () => { void load('refresh'); })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [resolveArea, load]);

  return { items, loading, refreshing, isNationalOnly, error, refresh, loadMore };
}
