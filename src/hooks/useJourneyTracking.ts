import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyJourneyStarted, notifyJourneyArrived } from '../lib/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface JourneySession {
  destination: string;
  mode: string;             // 'walking' | 'driving'
  startedAt: number;        // epoch ms
  startLatitude?: number;
  startLongitude?: number;
  currentLatitude?: number;
  currentLongitude?: number;
  contactsNotified: boolean;
}

const STORAGE_KEY = 'safen_active_journey';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useJourneyTracking() {
  const [session, setSession] = useState<JourneySession | null>(null);
  const [elapsedStr, setElapsedStr] = useState('0s');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  // ── Restore persisted session on mount ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const restored: JourneySession = JSON.parse(raw);
        setSession(restored);
      } catch (e: any) {
        console.error('[useJourneyTracking] Failed to parse restored session:', e);
      }
    });
  }, []);

  // ── Tick timer every second when journey is active ──────────────────────────
  useEffect(() => {
    if (!session) {
      if (tickRef.current) clearInterval(tickRef.current);
      setElapsedStr('0s');
      return;
    }
    const tick = () => setElapsedStr(formatElapsed(session.startedAt));
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session]);

  // ── Live location tracking when journey is active ───────────────────────────
  useEffect(() => {
    if (!session) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      return;
    }

    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !active) return;

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10_000,  // update every 10s
          distanceInterval: 50,  // or every 50m
        },
        (loc) => {
          if (!active) return;
          setSession(prev => {
            if (!prev) return prev;
            const updated: JourneySession = {
              ...prev,
              currentLatitude: loc.coords.latitude,
              currentLongitude: loc.coords.longitude,
            };
            // Persist updated location
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
  }, [session?.startedAt]); // Only re-subscribe when a new journey starts (startedAt changes)

  // ── Start journey ────────────────────────────────────────────────────────────
  const startJourney = useCallback(async (destination: string, mode: string) => {
    setIsStarting(true);
    try {
      // Grab current location for the starting point
      let startLat: number | undefined;
      let startLng: number | undefined;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        startLat = loc.coords.latitude;
        startLng = loc.coords.longitude;
      }

      const newSession: JourneySession = {
        destination,
        mode,
        startedAt: Date.now(),
        startLatitude: startLat,
        startLongitude: startLng,
        currentLatitude: startLat,
        currentLongitude: startLng,
        contactsNotified: false,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);

      // Notify contacts in the background — non-blocking
      notifyJourneyStarted({
        destination,
        mode,
        latitude: startLat ?? null,
        longitude: startLng ?? null,
      }).catch(err => console.warn('notifyJourneyStarted error:', err));

    } finally {
      setIsStarting(false);
    }
  }, []);

  // ── End journey (arrived safely) ─────────────────────────────────────────────
  const endJourney = useCallback(async () => {
    if (!session) return;
    setIsEnding(true);
    try {
      const dest = session.destination;

      // Stop location tracking
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      if (tickRef.current) clearInterval(tickRef.current);

      await AsyncStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setElapsedStr('0s');

      // Notify contacts in the background — non-blocking
      notifyJourneyArrived({ destination: dest })
        .catch(err => console.warn('notifyJourneyArrived error:', err));

    } finally {
      setIsEnding(false);
    }
  }, [session]);

  // ── Cancel journey (without notifying arrival) ───────────────────────────────
  const cancelJourney = useCallback(async () => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setElapsedStr('0s');
  }, []);

  return {
    session,
    elapsedStr,
    isActive: !!session,
    isStarting,
    isEnding,
    startJourney,
    endJourney,
    cancelJourney,
  };
}
