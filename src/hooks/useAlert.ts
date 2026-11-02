import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import {
  notifyEmergencyContacts,
  notifySosCancelled,
  notifyCommunityNearby,
} from '../lib/notifications';
import {
  isOnline,
  getEmergencyContactPhones,
  sendEmergencySms,
} from '../lib/emergencySms';
import { getUserDisplayName } from '../utils/userUtils';
import {
  type BroadcastScope,
  getStoredBroadcastScope,
  setStoredBroadcastScope,
} from '../utils/broadcastScope';
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  isBackgroundLocationTrackingActive,
} from '../services/backgroundLocation';

export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

/** 'ok' = online flow succeeded; 'sms' = offline fallback fired; 'no_contacts' = offline but no contacts cached; false = hard failure */
export type AlertResult = 'ok' | 'sms' | 'no_contacts' | false;

export type ActiveAlert = {
  id: string;
  type: AlertType;
  scope: BroadcastScope;
};

/**
 * How often (ms) to push a fresh location update to the alerts row
 * while an SOS is active and the app is in the foreground.
 */
const LOCATION_UPDATE_INTERVAL_MS = 30_000;

export function useAlert() {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [broadcastScope, setBroadcastScopeState] = useState<BroadcastScope>('both');
  const [isEscalating, setIsEscalating] = useState(false);

  // Load user's default broadcast scope preference from storage
  useEffect(() => {
    let isMounted = true;
    getStoredBroadcastScope().then((scope) => {
      if (isMounted) setBroadcastScopeState(scope);
    });
    return () => { isMounted = false; };
  }, []);

  const setBroadcastScope = useCallback(async (scope: BroadcastScope) => {
    setBroadcastScopeState(scope);
    await setStoredBroadcastScope(scope);
  }, []);

  // Re-hydrate any active alert from the DB on mount (covers app restarts).
  useEffect(() => {
    let isMounted = true;
    const fetchActiveAlert = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from('alerts')
        .select('id, type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isMounted && data) {
        const storedScope = (await AsyncStorage.getItem(`@safen_active_alert_scope_${data.id}`)) as BroadcastScope | null;
        setActiveAlert({
          id: data.id,
          type: data.type as AlertType,
          scope: storedScope === 'contacts_only' ? 'contacts_only' : 'both',
        });
      }
    };
    fetchActiveAlert();
    return () => { isMounted = false; };
  }, []);

  // ── Live location tracking (foreground & background) ─────────────────────
  // While an SOS is active, continuously push coordinates and log breadcrumbs
  // via expo-task-manager background service even if the app is backgrounded.
  useEffect(() => {
    if (!activeAlert) {
      stopBackgroundLocationTracking();
      return;
    }

    startBackgroundLocationTracking(activeAlert.id);

    // Foreground fallback: push a fresh location reading every 30s.
    // We skip the DB write if the background task is already running to avoid
    // writing the same coordinates twice (background fires every 15s).
    const intervalId = setInterval(async () => {
      try {
        const bgActive = await isBackgroundLocationTrackingActive();
        if (bgActive) return; // background task handles it — nothing to do

        const position = await Location.getLastKnownPositionAsync();
        if (!position) return;

        supabase
          .from('alerts')
          .update({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
          .eq('id', activeAlert.id)
          .then(({ error }) => {
            if (error) console.warn('[useAlert] location update failed:', error.message);
          });
      } catch (err) {
        console.warn('[useAlert] location refresh error:', err);
      }
    }, LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeAlert]);

  // ── Location helper ──────────────────────────────────────────────────────
  const getLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      let location = await Location.getLastKnownPositionAsync({ maxAge: 20000 }).catch(() => null);
      if (!location) {
        // Fast timeout (4s) for offline SOS so it doesn't hang before routing to SMS
        const fetchPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
        const freshLocation = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (freshLocation) location = freshLocation;
      }
      if (!location) return null;

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (e) {
      console.warn('Location fetch failed:', e);
      return null;
    }
  }, []);

  // ── Main trigger ─────────────────────────────────────────────────────────
  const triggerAlert = useCallback(async (
    type: AlertType,
    description?: string,
    customScope?: BroadcastScope,
  ): Promise<AlertResult> => {
    // Idempotency guard: if an alert is already active (either from a fresh trigger
    // or restored from the DB after a force-close / restart), do NOT create a new
    // alert row or re-notify contacts. Just surface the existing session.
    // This prevents the "5 force-closes = 5 notifications" bug.
    if (activeAlert) return 'ok';

    const effectiveScope = customScope ?? broadcastScope;

    setLoading(true);
    setLoadingMessage('Checking connectivity and location...');

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setLoading(false); return false; }

    // 1. FAST LOCATION + CONNECTIVITY CHECK (Run in parallel for speed)
    const [coords, online] = await Promise.all([
      getLocation(),
      isOnline()
    ]);

    // ── OFFLINE PATH (Zero Supabase Network Calls) ──────────────────────
    if (!online) {
      setLoadingMessage('Network unavailable. Preparing SMS fallback...');

      // Read from the local contact cache. Written by useContacts every time
      // the contacts list is fetched successfully while online.
      const cacheKey = `safen_cached_contacts_${user.id}`;
      const raw = await AsyncStorage.getItem(cacheKey);

      // Cache format: { cachedAt: number, contacts: CachedContact[] }
      // Older builds wrote a plain CachedContact[] — handle both shapes gracefully.
      type CachedContact = { name: string; phone: string; status: string };
      type CacheEnvelope = { cachedAt?: number; contacts?: CachedContact[] };

      // NOTE: We deliberately do NOT expire this cache by time. It refreshes
      // automatically whenever the user is online. If a contact removes themselves
      // while the user is offline, that gets cleaned up on the next online sync.
      // Blocking SOS because a cache is "old" is far more dangerous than sending
      // to a slightly stale contact list.
      let smsContacts: { name: string; phone: string }[] = [];

      if (raw) {
        const parsed: CachedContact[] | CacheEnvelope = JSON.parse(raw);
        const isEnvelope = !Array.isArray(parsed);
        let contactList: CachedContact[] = [];

        if (isEnvelope) {
          const { contacts } = parsed as CacheEnvelope;
          // Only skip if the envelope is literally empty/malformed
          if (contacts && contacts.length > 0) {
            contactList = contacts;
          }
        } else {
          // Legacy plain-array format
          contactList = parsed as CachedContact[];
        }

        smsContacts = contactList
          .filter((c) => c.status === 'accepted' && c.phone?.trim().length > 0)
          .map((c) => ({ name: c.name || 'Contact', phone: c.phone.trim() }));
      }

      if (smsContacts.length === 0) {
        // Cache is cold (never visited contacts tab) or all contacts are unaccepted.
        // Surface this clearly so the caller can show a meaningful error.
        console.warn('[useAlert] Offline SMS skipped: no accepted contacts found in cache.');
        setLoading(false);
        setLoadingMessage(null);
        return 'no_contacts';
      }

      // Use cached user metadata for sender name to avoid any network call.
      const senderName = getUserDisplayName(user, null);

      await new Promise(r => setTimeout(r, 400)); // Brief UI feedback before SMS composer opens
      setLoading(false);
      setLoadingMessage(null);

      const result = await sendEmergencySms(smsContacts, senderName, coords, type, description);
      if (!result.success) {
        console.warn('[useAlert] sendEmergencySms failed:', result.reason);
      }
      return result.success ? 'sms' : false;
    }

    // ── ONLINE PATH ──────────────────────────────────────────────────────
    setLoadingMessage('Connecting to emergency network...');
    
    // Now it's safe to run Supabase queries because we know we are online
    const [profileRes, smsContacts] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      getEmergencyContactPhones(user.id),
    ]);
    const senderName = getUserDisplayName(user, profileRes.data?.full_name);

    setLoadingMessage('Activating SOS protocol...');
    
    const basePayload = {
      user_id: user.id,
      type,
      status: 'active',
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    };

    let data: { id: string } | null = null;
    let error: PostgrestError | null = null;

    // Try inserting with description first; fall back without it
    if (description?.trim()) {
      const res = await supabase
        .from('alerts')
        .insert({ ...basePayload, description: description.trim() })
        .select('id')
        .single();
      data = res.data;
      error = res.error;
    }

    if (!data) {
      // The description insert either wasn't attempted (no description) or
      // failed (e.g. schema mismatch) — log the original error before retrying.
      if (description?.trim() && error) {
        console.warn('[useAlert] Description insert failed, retrying without description:', error.message);
      }
      const res = await supabase
        .from('alerts')
        .insert(basePayload)
        .select('id')
        .single();
      data = res.data;
      error = res.error;
    }

    setLoading(false);
    setLoadingMessage(null);
    if (error || !data) {
      if (error) {
        console.error('[useAlert] Failed to activate SOS in DB:', error.message, error.details, error.hint);
      }
      return false;
    }

    // Store active alert scope for session continuity across app restarts
    await AsyncStorage.setItem(`@safen_active_alert_scope_${data.id}`, effectiveScope).catch((err) => {
      console.warn('[useAlert] Failed to persist alert scope to storage:', err);
    });
    setActiveAlert({ id: data.id, type, scope: effectiveScope });

    // Insert initial event into the feed (fire-and-forget)
    supabase.from('sos_events').insert({
      alert_id: data.id,
      event_type: 'system',
      message: effectiveScope === 'both'
        ? 'Emergency triggered. Alerting contacts and nearby community (~800m)...'
        : 'Emergency triggered in discreet mode. Alerting trusted contacts only...',
      actor_id: user.id,
    }).then(({ error: insertErr }) => {
      if (insertErr) console.warn('Failed to insert initial SOS event:', insertErr);
    });

    // Fan out in-app notifications to contacts (fire-and-forget)
    notifyEmergencyContacts({
      type,
      alertId: data.id,
      latitude: coords?.latitude ?? undefined,
      longitude: coords?.longitude ?? undefined,
      detailsSnippet: description?.trim() ?? undefined,
    });

    // Fan out to nearby community if broadcast scope includes community
    if (effectiveScope === 'both') {
      notifyCommunityNearby({
        alertId: data.id,
        type,
        latitude: coords?.latitude ?? undefined,
        longitude: coords?.longitude ?? undefined,
        detailsSnippet: description?.trim() ?? undefined,
      });
    }

    return 'ok';
  }, [getLocation, activeAlert, broadcastScope]);

  // ── Cancel ───────────────────────────────────────────────────────────────
  const cancelAlert = useCallback(async (): Promise<boolean> => {
    if (!activeAlert) return false;
    setLoading(true);

    const cancelledAlertId = activeAlert.id;
    const hadCommunityBroadcast = activeAlert.scope === 'both';
    const { data: { session } } = await supabase.auth.getSession();
    const actorId = session?.user?.id ?? null;

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', cancelledAlertId);

    setLoading(false);
    if (error) return false;

    await stopBackgroundLocationTracking();

    // Notify contacts (and nearby community if broadcast) that the emergency has been resolved
    notifySosCancelled({ alertId: cancelledAlertId, hadCommunityBroadcast }).catch(
      (err) => console.warn('[useAlert] cancel notification failed:', err)
    );
    await AsyncStorage.removeItem(`@safen_active_alert_scope_${cancelledAlertId}`).catch((err) => {
      console.warn('[useAlert] Failed to remove alert scope from storage:', err);
    });
    setActiveAlert(null);

    // Insert cancellation event into the feed (fire-and-forget)
    supabase.from('sos_events').insert({
      alert_id: cancelledAlertId,
      event_type: 'system',
      message: 'Emergency resolved and cancelled by user.',
      actor_id: actorId,
    }).then(({ error: insertErr }) => {
      if (insertErr) console.warn('Failed to insert cancellation event:', insertErr);
    });

    return true;
  }, [activeAlert]);

  // ── Layer 3: Escalate to Community ──────────────────────────────────────
  const escalateToCommunity = useCallback(async (): Promise<boolean> => {
    if (!activeAlert || activeAlert.scope === 'both') return false;
    setIsEscalating(true);
    try {
      const coords = await getLocation();
      await notifyCommunityNearby({
        alertId: activeAlert.id,
        type: activeAlert.type,
        latitude: coords?.latitude ?? undefined,
        longitude: coords?.longitude ?? undefined,
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        void supabase.from('sos_events').insert({
          alert_id: activeAlert.id,
          event_type: 'system',
          message: 'Alert escalated: Nearby community notified within ~800m.',
          actor_id: session.user.id,
        });
      }

      await AsyncStorage.setItem(`@safen_active_alert_scope_${activeAlert.id}`, 'both').catch((err) => {
        console.warn('[useAlert] Failed to persist escalated scope to storage:', err);
      });
      setActiveAlert((prev) => (prev ? { ...prev, scope: 'both' } : null));
      return true;
    } catch (err) {
      console.warn('[useAlert] escalateToCommunity failed:', err);
      return false;
    } finally {
      setIsEscalating(false);
    }
  }, [activeAlert, getLocation]);

  return useMemo(() => ({
    loading,
    loadingMessage,
    activeAlert,
    broadcastScope,
    setBroadcastScope,
    isEscalating,
    escalateToCommunity,
    triggerAlert,
    cancelAlert,
  }), [
    loading,
    loadingMessage,
    activeAlert,
    broadcastScope,
    setBroadcastScope,
    isEscalating,
    escalateToCommunity,
    triggerAlert,
    cancelAlert,
  ]);
}


