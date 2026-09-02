import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripShareContact {
  id: string;                     // emergency_contacts row id
  contactUserId: string;          // profiles.id of the contact
  name: string;
  avatarUrl?: string | null;
}

export interface TripShareSession {
  contactUserId: string;
  contactName: string;
  durationMinutes: number;        // selected duration (0 = unlimited)
  startedAt: number;              // epoch ms
  expiresAt: number | null;       // epoch ms or null for unlimited
  notificationRowId: string | null; // id of the notification row we upsert
  currentLatitude?: number;
  currentLongitude?: number;
}

const STORAGE_KEY = 'safen_active_trip_share';
const UPDATE_INTERVAL_MS = 60_000; // update contact's location every 60s

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRemainingStr(expiresAt: number | null, startedAt: number): string {
  if (!expiresAt) return 'Sharing live';
  const remaining = Math.max(0, expiresAt - Date.now());
  const totalSecs = Math.floor(remaining / 1000);
  if (totalSecs <= 0) return 'Expiring...';
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s left`;
  return `${secs}s left`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useShareLiveTrip() {
  const [session, setSession] = useState<TripShareSession | null>(null);
  const [remainingStr, setRemainingStr] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const restored: TripShareSession = JSON.parse(raw);
        // Auto-expire if already past end time
        if (restored.expiresAt && Date.now() >= restored.expiresAt) {
          AsyncStorage.removeItem(STORAGE_KEY);
          return;
        }
        setSession(restored);
      } catch (e: unknown) {
        console.error('[useShareLiveTrip] Failed to parse restored session:', e);
      }
    });
  }, []);

  // ── Countdown tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      if (tickRef.current) clearInterval(tickRef.current);
      setRemainingStr('');
      setIsExpired(false);
      return;
    }

    const tick = () => {
      setRemainingStr(getRemainingStr(session.expiresAt, session.startedAt));
      if (session.expiresAt && Date.now() >= session.expiresAt) {
        setIsExpired(true);
      }
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session]);

  // ── Auto-stop when expired ──────────────────────────────────────────────────
  useEffect(() => {
    if (isExpired && session) {
      stopSharing(true);
    }
  }, [isExpired]);

  // ── GPS watcher ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);
      return;
    }

    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) return;

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 30 },
        (loc) => {
          if (!active) return;
          setSession(prev => {
            if (!prev) return prev;
            const updated = { ...prev, currentLatitude: loc.coords.latitude, currentLongitude: loc.coords.longitude };
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });
        }
      );
    })();

    return () => {
      active = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [session?.startedAt]);

  // ── Periodic location push to contact (update notification row) ─────────────
  useEffect(() => {
    if (!session) {
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);
      return;
    }

    const pushLocation = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const current: TripShareSession = JSON.parse(raw);
      if (!current.notificationRowId || !current.currentLatitude || !current.currentLongitude) return;

      await supabase
        .from('notifications')
        .update({
          latitude: current.currentLatitude,
          longitude: current.currentLongitude,
          body: `📍 Live location updated — tap to view on map.`,
        })
        .eq('id', current.notificationRowId);
    };

    updateTimerRef.current = setInterval(pushLocation, UPDATE_INTERVAL_MS);
    return () => { if (updateTimerRef.current) clearInterval(updateTimerRef.current); };
  }, [session?.startedAt]);

  // ── Start sharing ───────────────────────────────────────────────────────────
  const startSharing = useCallback(async (
    contactUserId: string,
    contactName: string,
    durationMinutes: number
  ) => {
    setIsStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current position
      let lat: number | undefined;
      let lng: number | undefined;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const senderName = profile?.full_name?.trim() || 'A contact';
      const durationLabel = durationMinutes === 0 ? 'until stopped' : `for ${durationMinutes} minutes`;
      const title = `📍 ${senderName} is sharing their live location`;
      const body = `${senderName} is sharing their live location with you ${durationLabel}. Tap to see where they are.`;

      // INSERT without chaining .select() — RLS blocks SELECT after INSERT on this table
      const { error: insertError } = await supabase
        .from('notifications')
        .insert([{
          recipient_id: contactUserId,
          sender_id: user.id,
          sender_name: senderName,
          type: 'report', // bypasses DB enum constraint
          title,
          body,
          latitude: lat ?? null,
          longitude: lng ?? null,
        }]);

      if (insertError) {
        console.warn('Share trip notification insert failed:', insertError.message);
      }

      // Separately fetch the notification row ID so we can update location later
      let notificationRowId: string | null = null;
      if (!insertError) {
        const { data: fetchedRow } = await supabase
          .from('notifications')
          .select('id')
          .eq('recipient_id', contactUserId)
          .eq('sender_id', user.id)
          .eq('title', title)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        notificationRowId = fetchedRow?.id ?? null;
      }

      const now = Date.now();
      const newSession: TripShareSession = {
        contactUserId,
        contactName,
        durationMinutes,
        startedAt: now,
        expiresAt: durationMinutes > 0 ? now + durationMinutes * 60 * 1000 : null,
        notificationRowId,
        currentLatitude: lat,
        currentLongitude: lng,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);
      setIsExpired(false);
    } finally {
      setIsStarting(false);
    }
  }, []);

  // ── Stop sharing ────────────────────────────────────────────────────────────
  const stopSharing = useCallback(async (expired = false) => {
    setIsEnding(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const current: TripShareSession = JSON.parse(raw);

      // Cleanup listeners/timers
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      if (tickRef.current) clearInterval(tickRef.current);
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);

      // Send "stopped sharing" notification to contact
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        const senderName = profile?.full_name?.trim() || 'A contact';
        const title = expired
          ? `📍 ${senderName}'s location sharing ended`
          : `📍 ${senderName} stopped sharing their location`;
        const body = expired
          ? `The live location share from ${senderName} has expired.`
          : `${senderName} has stopped sharing their live location.`;

        await supabase.from('notifications').insert([{
          recipient_id: current.contactUserId,
          sender_id: user.id,
          sender_name: senderName,
          type: 'report',
          title,
          body,
          latitude: current.currentLatitude ?? null,
          longitude: current.currentLongitude ?? null,
        }]);
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setRemainingStr('');
      setIsExpired(false);
    } finally {
      setIsEnding(false);
    }
  }, []);

  // ── Extend duration ─────────────────────────────────────────────────────────
  const extendSharing = useCallback(async (extraMinutes: number) => {
    setSession(prev => {
      if (!prev) return prev;
      const newExpiry = prev.expiresAt
        ? prev.expiresAt + extraMinutes * 60 * 1000
        : Date.now() + extraMinutes * 60 * 1000;
      const updated = { ...prev, expiresAt: newExpiry };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setIsExpired(false);
  }, []);

  return {
    session,
    remainingStr,
    isActive: !!session,
    isStarting,
    isEnding,
    startSharing,
    stopSharing,
    extendSharing,
  };
}
