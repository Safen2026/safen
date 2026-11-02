/**
 * useRadarAlerts.ts
 *
 * Fetches active community-broadcast alerts near the user's location and
 * streams real-time updates via Supabase Realtime. Also fetches the
 * breadcrumb trail (location history) for a selected alert.
 *
 * Sources:
 *  1. 'alerts' table:
 *     - Active alerts from past 24h owned by user (User's own SOS)
 *     - Active alerts where user is an emergency contact or confirmed responder
 *  2. 'notifications' table:
 *     - Nearby community broadcast notifications (is_community_broadcast = true)
 *       delivered to this user within past 24h
 *
 * Filtering:
 *  - Enforces a strict 24-hour time window (eliminates stale/forgotten test alerts)
 *  - Excludes cancelled/resolved alerts
 *  - Computes exact Haversine distance client-side
 *  - Real-time updates on both 'alerts' and 'notifications' tables
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
  /** True if this alert was triggered by the logged-in user */
  isOwn: boolean;
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
const REALTIME_CHANNEL = 'radar-alerts-v2';
/** Stale cutoff: Ignore any alert older than 24 hours */
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000;

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

  // Keep stable ref to user's coordinates for realtime calculations
  const coordsRef = useRef({ latitude, longitude });
  coordsRef.current = { latitude, longitude };

  // ── Fetch active nearby alerts ────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (latitude == null || longitude == null) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id ?? null;
      const cutoffTime = new Date(Date.now() - MAX_ALERT_AGE_MS).toISOString();

      // Bounding box for pre-filtering (cheap)
      const latDelta = radiusMeters / 111_320;
      const lngDelta = radiusMeters / (111_320 * Math.cos((latitude * Math.PI) / 180));

      // 1. Fetch from 'alerts' table (covers user's own alert, contacts, responders)
      const alertsQuery = supabase
        .from('alerts')
        .select(
          'id, type, latitude, longitude, created_at, user_id, profiles!alerts_user_id_fkey(full_name)'
        )
        .eq('status', 'active')
        .gte('created_at', cutoffTime)
        .gte('latitude', latitude - latDelta)
        .lte('latitude', latitude + latDelta)
        .gte('longitude', longitude - lngDelta)
        .lte('longitude', longitude + lngDelta)
        .order('created_at', { ascending: false })
        .limit(50);

      // 2. Fetch from 'notifications' table (covers community broadcasts received by user)
      const notifsQuery = supabase
        .from('notifications')
        .select(
          'id, alert_id, type, latitude, longitude, created_at, sender_name, is_community_broadcast'
        )
        .eq('is_community_broadcast', true)
        .not('alert_id', 'is', null)
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(50);

      // 3. Fetch any cancellation notifications to weed out resolved alerts
      const cancelNotifsQuery = supabase
        .from('notifications')
        .select('alert_id')
        .eq('type', 'sos_ack')
        .gte('created_at', cutoffTime);

      const [alertsRes, notifsRes, cancelRes] = await Promise.all([
        alertsQuery,
        notifsQuery,
        cancelNotifsQuery,
      ]);

      if (alertsRes.error && notifsRes.error) {
        console.warn('[useRadarAlerts] fetch error:', alertsRes.error?.message, notifsRes.error?.message);
        setError('Could not load nearby alerts.');
        return;
      }

      // Collect cancelled alert IDs
      const cancelledIds = new Set<string>();
      (cancelRes.data ?? []).forEach((c) => {
        if (c.alert_id) cancelledIds.add(c.alert_id);
      });

      const resultMap = new Map<string, RadarAlert>();

      // Process rows from 'alerts' table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (alertsRes.data ?? []).forEach((row: any) => {
        const isOwn = currentUserId != null && row.user_id === currentUserId;
        const rowLat = row.latitude ?? (isOwn ? latitude : null);
        const rowLng = row.longitude ?? (isOwn ? longitude : null);

        if (rowLat == null || rowLng == null) return;

        const distanceMeters = getDistanceMeters(latitude, longitude, rowLat, rowLng);
        if (distanceMeters > radiusMeters && !isOwn) return;

        const profilesRaw = row.profiles;
        const profile = Array.isArray(profilesRaw) ? (profilesRaw[0] ?? null) : profilesRaw ?? null;
        const senderName = isOwn ? 'You' : (profile?.full_name ?? null);

        resultMap.set(row.id, {
          id: row.id,
          type: (row.type ?? 'sos') as AlertType,
          latitude: rowLat,
          longitude: rowLng,
          distanceMeters: isOwn ? 0 : distanceMeters,
          createdAt: row.created_at,
          senderName,
          isOwn,
        });
      });

      // Process rows from 'notifications' table (community broadcasts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (notifsRes.data ?? []).forEach((n: any) => {
        const alertId = n.alert_id as string;
        if (!alertId || resultMap.has(alertId) || cancelledIds.has(alertId)) return;

        const nLat: number | null = n.latitude ?? null;
        const nLng: number | null = n.longitude ?? null;
        if (nLat == null || nLng == null) return;

        const distanceMeters = getDistanceMeters(latitude, longitude, nLat, nLng);
        if (distanceMeters > radiusMeters) return;

        resultMap.set(alertId, {
          id: alertId,
          type: (n.type ?? 'sos') as AlertType,
          latitude: nLat,
          longitude: nLng,
          distanceMeters,
          createdAt: n.created_at,
          senderName: n.sender_name ?? 'Community Member',
          isOwn: false,
        });
      });

      const parsed = Array.from(resultMap.values()).sort((a, b) => {
        // Own alert always first, then closest by distance
        if (a.isOwn && !b.isOwn) return -1;
        if (!a.isOwn && b.isOwn) return 1;
        return a.distanceMeters - b.distanceMeters;
      });

      setAlerts(parsed);
    } catch (err) {
      console.warn('[useRadarAlerts] unexpected error:', err);
      setError('Something went wrong loading the radar.');
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude, radiusMeters]);

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
        .limit(200);

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

  // ── Effect: Supabase Realtime subscriptions ───────────────────────────────

  useEffect(() => {
    if (latitude == null || longitude == null) return;

    const channel = supabase
      .channel(REALTIME_CHANNEL)
      // Listen for alerts changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
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

          if (row.status !== 'active') {
            // Cancelled or resolved
            setAlerts((prev) => prev.filter((a) => a.id !== row.id));
            setSelectedAlertId((prev) => (prev === row.id ? null : prev));
            return;
          }

          // Active alert insert or update -> refresh radar
          fetchAlerts();
        }
      )
      // Listen for community notifications
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const notif = payload.new as {
            type: string;
            alert_id: string | null;
            is_community_broadcast?: boolean;
          };

          if (notif.is_community_broadcast || notif.type === 'sos_ack') {
            // Community broadcast received or cancelled -> refresh radar
            fetchAlerts();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [latitude, longitude, fetchAlerts]);

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
