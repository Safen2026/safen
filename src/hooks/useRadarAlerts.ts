/**
 * useRadarAlerts.ts
 *
 * Fetches active community-broadcast alerts near the user's location and
 * streams real-time updates via Supabase Realtime. Also fetches the
 * breadcrumb trail (location history) for a selected alert.
 *
 * Responsibilities:
 *  - Query 'alerts' table for active, community-scoped rows within ~5 km
 *  - Subscribe to INSERT/UPDATE on alerts so new SOS pins appear instantly
 *  - Fetch ordered breadcrumb rows from the 'locations' table for a given alertId
 *  - Expose loading state, error state, and a refresh function
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getDistanceMeters } from '../utils/location';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

export interface RadarAlert {
  id: string;
  type: AlertType;
  latitude: number;
  longitude: number;
  /** Distance from the current user in metres */
  distanceMeters: number;
  createdAt: string;
  senderName: string | null;
}

export interface Breadcrumb {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface UseRadarAlertsOptions {
  /** User's current latitude. Pass null while location is loading. */
  latitude: number | null;
  /** User's current longitude. Pass null while location is loading. */
  longitude: number | null;
  /** Radius in metres to fetch nearby alerts. Defaults to 5000 (5 km). */
  radiusMeters?: number;
}

interface UseRadarAlertsResult {
  alerts: RadarAlert[];
  loading: boolean;
  error: string | null;
  selectedAlertId: string | null;
  setSelectedAlertId: (id: string | null) => void;
  breadcrumbs: Breadcrumb[];
  breadcrumbsLoading: boolean;
  refresh: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_RADIUS_METERS = 5000;
/** Supabase Realtime channel name — one per map screen mount */
const REALTIME_CHANNEL = 'radar-alerts';

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useRadarAlerts({
  latitude,
  longitude,
  radiusMeters = DEFAULT_RADIUS_METERS,
}: UseRadarAlertsOptions): UseRadarAlertsResult {
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(false);

  // Keep a stable ref to the user's coordinates so the realtime handler can
  // compute distances without a stale closure.
  const coordsRef = useRef({ latitude, longitude });
  coordsRef.current = { latitude, longitude };

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Convert a raw DB row into a RadarAlert, computing distance from the user. */
  const rowToAlert = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row: any): RadarAlert | null => {
      const { latitude: userLat, longitude: userLng } = coordsRef.current;
      const rowLat: number | null = row.latitude ?? null;
      const rowLng: number | null = row.longitude ?? null;
      if (
        rowLat == null ||
        rowLng == null ||
        userLat == null ||
        userLng == null
      ) {
        return null;
      }
      const distanceMeters = getDistanceMeters(userLat, userLng, rowLat, rowLng);

      // profiles may be a single object or an array depending on Supabase version
      const profilesRaw = row.profiles;
      const profile = Array.isArray(profilesRaw)
        ? (profilesRaw[0] ?? null)
        : profilesRaw ?? null;
      const senderName: string | null = profile?.full_name ?? null;

      return {
        id: row.id as string,
        type: row.type as AlertType,
        latitude: rowLat,
        longitude: rowLng,
        distanceMeters,
        createdAt: row.created_at as string,
        senderName,
      };
    },
    []
  );

  // ── Fetch active nearby alerts ────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (latitude == null || longitude == null) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Fetch alerts that are active and community-scoped (scope = 'both').
      // We filter by a rough bounding box first (cheap), then compute exact
      // Haversine distances client-side to cull anything outside the radius.
      const latDelta = radiusMeters / 111_320; // ~1 degree latitude ≈ 111 320 m
      const lngDelta =
        radiusMeters / (111_320 * Math.cos((latitude * Math.PI) / 180));

      const { data, error: fetchError } = await supabase
        .from('alerts')
        .select(
          'id, type, latitude, longitude, created_at, profiles!alerts_user_id_fkey(full_name)'
        )
        .eq('status', 'active')
        // Only show community-broadcast alerts on the radar
        .neq('user_id', userId ?? '') // don't show the user's own alert as a radar pin
        .gte('latitude', latitude - latDelta)
        .lte('latitude', latitude + latDelta)
        .gte('longitude', longitude - lngDelta)
        .lte('longitude', longitude + lngDelta)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        console.warn('[useRadarAlerts] fetch error:', fetchError.message);
        setError('Could not load nearby alerts.');
        return;
      }

      const parsed = (data ?? [])
        .map(rowToAlert)
        .filter((a): a is RadarAlert => a !== null)
        // Final Haversine cull — removes corners of the bounding box
        .filter((a) => a.distanceMeters <= radiusMeters)
        // Closest first
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      setAlerts(parsed);
    } catch (err) {
      console.warn('[useRadarAlerts] unexpected error:', err);
      setError('Something went wrong loading the radar.');
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude, radiusMeters, rowToAlert]);

  // ── Fetch breadcrumbs for selected alert ─────────────────────────────────

  const fetchBreadcrumbs = useCallback(async (alertId: string) => {
    setBreadcrumbsLoading(true);
    setBreadcrumbs([]);

    try {
      const { data, error: fetchError } = await supabase
        .from('locations')
        .select('latitude, longitude, timestamp')
        .eq('alert_id', alertId)
        .order('timestamp', { ascending: true })
        .limit(200); // Cap at 200 points for polyline performance

      if (fetchError) {
        console.warn('[useRadarAlerts] breadcrumbs fetch error:', fetchError.message);
        return;
      }

      setBreadcrumbs(
        (data ?? []).map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          timestamp: r.timestamp,
        }))
      );
    } catch (err) {
      console.warn('[useRadarAlerts] breadcrumbs unexpected error:', err);
    } finally {
      setBreadcrumbsLoading(false);
    }
  }, []);

  // ── Effect: fetch on location available / change ──────────────────────────

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // ── Effect: Supabase Realtime subscription ────────────────────────────────

  useEffect(() => {
    if (latitude == null || longitude == null) return;

    const channel = supabase
      .channel(REALTIME_CHANNEL)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `status=eq.active`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Alert was hard-deleted — remove from list
            setAlerts((prev) => prev.filter((a) => a.id !== payload.old?.id));
            return;
          }

          const row = payload.new as {
            id: string;
            type: string;
            latitude: number | null;
            longitude: number | null;
            status: string;
            created_at: string;
            user_id: string;
          };

          // If a previously active alert is now cancelled/resolved — drop it
          if (row.status !== 'active') {
            setAlerts((prev) => prev.filter((a) => a.id !== row.id));
            // If this was the selected alert, deselect
            setSelectedAlertId((prev) => (prev === row.id ? null : prev));
            return;
          }

          // Build a basic RadarAlert from realtime payload (no joined profile).
          // We'll get the sender name on the next full refresh, which is fine.
          const { latitude: userLat, longitude: userLng } = coordsRef.current;
          if (
            row.latitude == null ||
            row.longitude == null ||
            userLat == null ||
            userLng == null
          ) {
            return;
          }

          const distanceMeters = getDistanceMeters(
            userLat,
            userLng,
            row.latitude,
            row.longitude
          );

          if (distanceMeters > radiusMeters) return; // Outside the radar radius

          const newAlert: RadarAlert = {
            id: row.id,
            type: row.type as AlertType,
            latitude: row.latitude,
            longitude: row.longitude,
            distanceMeters,
            createdAt: row.created_at,
            senderName: null,
          };

          setAlerts((prev) => {
            const existingIdx = prev.findIndex((a) => a.id === newAlert.id);
            if (existingIdx >= 0) {
              // Update existing (e.g. location changed)
              const updated = [...prev];
              updated[existingIdx] = newAlert;
              return updated.sort((a, b) => a.distanceMeters - b.distanceMeters);
            }
            // New alert — prepend then sort
            return [...prev, newAlert].sort(
              (a, b) => a.distanceMeters - b.distanceMeters
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [latitude, longitude, radiusMeters]);

  // ── Effect: fetch breadcrumbs when selected alert changes ─────────────────

  useEffect(() => {
    if (!selectedAlertId) {
      setBreadcrumbs([]);
      return;
    }
    fetchBreadcrumbs(selectedAlertId);
  }, [selectedAlertId, fetchBreadcrumbs]);

  return {
    alerts,
    loading,
    error,
    selectedAlertId,
    setSelectedAlertId,
    breadcrumbs,
    breadcrumbsLoading,
    refresh: fetchAlerts,
  };
}

