import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import { notifyEmergencyContacts } from '../lib/notifications';
import {
  isOnline,
  getEmergencyContactPhones,
  sendEmergencySms,
} from '../lib/emergencySms';
import { getUserDisplayName } from '../utils/userUtils';

export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

/** 'ok' = online flow succeeded; 'sms' = offline fallback fired; false = both failed */
export type AlertResult = 'ok' | 'sms' | false;

export type ActiveAlert = {
  id: string;
  type: AlertType;
};

export function useAlert() {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);

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
        setActiveAlert({ id: data.id, type: data.type as AlertType });
      }
    };
    fetchActiveAlert();
    return () => { isMounted = false; };
  }, []);

  // ── Location helper ──────────────────────────────────────────────────────
  const getLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      let location = await Location.getLastKnownPositionAsync();
      if (!location) {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
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
  const triggerAlert = useCallback(async (type: AlertType, description?: string): Promise<AlertResult> => {
    setLoading(true);
    setLoadingMessage('Acquiring secure location...');

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setLoading(false); return false; }

    // 1. Location — fast via getLastKnownPositionAsync
    const coords = await getLocation();

    setLoadingMessage('Connecting to emergency network...');
    // 2. Fetch sender name + contact phones upfront (needed for both paths).
    // The profiles query may fail offline, so we fall back to user_metadata
    // which is always cached by the Supabase auth session on-device.
    const [profileRes, smsContacts] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      getEmergencyContactPhones(user.id),
    ]);
    const senderName = getUserDisplayName(user, profileRes.data?.full_name);

    // 3. Check connectivity
    const online = await isOnline();

    // ── OFFLINE PATH ─────────────────────────────────────────────────────
    if (!online) {
      setLoadingMessage('Network unavailable. Preparing SMS fallback...');
      // Give UI a moment to show the message before blocking on SMS composer
      await new Promise(r => setTimeout(r, 600)); 
      setLoading(false);
      setLoadingMessage(null);
      const result = await sendEmergencySms(smsContacts, senderName, coords, type, description);
      return result.success ? 'sms' : false;
    }

    setLoadingMessage('Activating SOS protocol...');
    // ── ONLINE PATH ──────────────────────────────────────────────────────
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
    if (error || !data) return false;

    setActiveAlert({ id: data.id, type });

    // Insert initial event into the feed (fire-and-forget)
    supabase.from('sos_events').insert({
      alert_id: data.id,
      event_type: 'system',
      message: 'Emergency triggered. Alerting your network...',
      actor_id: user.id
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

    return 'ok';
  }, [getLocation]);

  // ── Cancel ───────────────────────────────────────────────────────────────
  const cancelAlert = useCallback(async (): Promise<boolean> => {
    if (!activeAlert) return false;
    setLoading(true);

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', activeAlert.id);

    setLoading(false);
    if (error) return false;

    setActiveAlert(null);

    // Insert cancellation event into the feed (fire-and-forget)
    supabase.from('sos_events').insert({
      alert_id: activeAlert.id,
      event_type: 'system',
      message: 'Emergency resolved and cancelled by user.',
      actor_id: (await supabase.auth.getSession()).data.session?.user?.id
    }).then(({ error: insertErr }) => {
      if (insertErr) console.warn('Failed to insert cancellation event:', insertErr);
    });

    return true;
  }, [activeAlert]);

  return useMemo(() => ({
    loading,
    loadingMessage,
    activeAlert,
    triggerAlert,
    cancelAlert
  }), [loading, loadingMessage, activeAlert, triggerAlert, cancelAlert]);
}
