import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getMediaType } from '../utils/mediaUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Strict union matching the CHECK constraint in the alerts table. */
export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

/** Strict union matching the alerts.status column values. */
export type AlertStatus = 'active' | 'cancelled' | 'resolved';

/** Strict union matching the community_responders.status CHECK constraint. */
export type ResponderStatus = 'on_the_way' | 'arrived' | 'cancelled';

/**
 * Details returned by get_community_alert_details().
 *
 * Phase 1 (pre-respond):  firstName is set; all other sensitive fields are null.
 * Phase 2 (post-respond): fullName, latitude, longitude, description, audioUrl are populated.
 *
 * `isResponder` is the single source of truth — derived from the server, never
 * inferred from local state.
 */
export type AlertDetails = {
  firstName:      string;
  fullName:       string | null;   // null until confirmed responder or owner
  latitude:       number | null;   // null until confirmed responder or owner
  longitude:      number | null;   // null until confirmed responder or owner
  description:    string | null;   // null until confirmed responder or owner
  type:           AlertType;
  status:         AlertStatus;
  isResponder:    boolean;         // server-authoritative; drives Phase 1/2 UI
  responderCount: number;
  /** All audio chunk URLs recorded during the SOS, ordered oldest→newest. Phase 2 only. */
  audioUrls:      string[];
  /** Latest single audio clip URL (for backward compatibility). */
  audioUrl?:      string | null;
};

/**
 * Result codes from the respond_to_community_alert() atomic RPC.
 * Mirrors the DB function's return values exactly.
 */
export type RespondResult =
  | 'ok'             // registered successfully
  | 'already_responded' // was already registered (re-fetched successfully)
  | 'alert_inactive' // alert was cancelled/resolved before the tap
  | 'self_respond'   // caller is the alert owner — not permitted
  | 'error';         // unexpected error

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the Responder-Gated Disclosure flow for community alerts.
 *
 * Flow:
 *   1. On mount: call fetchDetails(alertId)  →  Phase 1 data (first name, count, etc.)
 *   2. User taps "I'm Responding": call respond(alertId)  →  re-fetches, Phase 2 unlocked
 *   3. User taps "Cancel": call updateStatus(alertId, 'cancelled')  →  revokes access
 */
export function useCommunityRespond() {
  const [loading, setLoading]               = useState(false);
  const [respondLoading, setRespondLoading] = useState(false);
  const [details, setDetails]               = useState<AlertDetails | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightPromiseRef = useRef<Promise<AlertDetails | null> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Fetch alert details (gated by whether the caller is a confirmed responder).
   * Safe to call multiple times — always reflects current server state.
   */
  const fetchDetails = useCallback(async (alertId: string, options?: { silent?: boolean }): Promise<AlertDetails | null> => {
    if (!alertId) return null;

    // Drop overlapping background polls to conserve bandwidth on slow connections
    if (options?.silent && inFlightPromiseRef.current) {
      return null;
    }

    // If an earlier background poll is currently in-flight, wait for it to finish
    if (inFlightPromiseRef.current) {
      try {
        await inFlightPromiseRef.current;
      } catch {
        // Continue to fresh fetch even if previous one errored
      }
    }

    const executeFetch = async (): Promise<AlertDetails | null> => {
      if (!options?.silent && mountedRef.current) {
        setLoading(true);
        setError(null);
      }
      try {
        const isLocallyResponded = (await AsyncStorage.getItem(`@safen_responded_${alertId}`).catch(() => null)) === 'true';

        // 1. Attempt server RPC
        const { data, error: rpcErr } = await supabase.rpc('get_community_alert_details', {
          p_alert_id: alertId,
        });

        if (!rpcErr && data) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row) {
            let lat = typeof row.latitude === 'number' ? row.latitude : null;
            let lng = typeof row.longitude === 'number' ? row.longitude : null;
            const isResp = Boolean(row.is_responder) || isLocallyResponded;
            const rpcAudio = typeof row.audio_url === 'string' && row.audio_url.trim() ? row.audio_url.trim() : null;

            // Coordinate hydration: if coordinates are null, reliably hydrate from notifications
            // or the latest breadcrumb in locations (applies to both Phase 1 & Phase 2)
            if (lat == null || lng == null) {
              const { data: notif } = await supabase
                .from('notifications')
                .select('latitude, longitude')
                .eq('alert_id', alertId)
                .maybeSingle();

              if (notif?.latitude != null && notif?.longitude != null) {
                lat = notif.latitude;
                lng = notif.longitude;
              } else {
                // Secondary fallback: latest location breadcrumb
                const { data: loc } = await supabase
                  .from('locations')
                  .select('latitude, longitude')
                  .eq('alert_id', alertId)
                  .order('recorded_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (loc?.latitude != null && loc?.longitude != null) {
                  lat = loc.latitude;
                  lng = loc.longitude;
                }
              }
            }

            // Audio hydration for Phase 2 responders:
            // Collect ALL audio chunk URLs from media_paths, ordered chronologically.
            let audioUrls: string[] = [];
            if (isResp) {
              const { data: alertMedia } = await supabase
                .from('alerts')
                .select('media_paths')
                .eq('id', alertId)
                .maybeSingle();

              if (Array.isArray(alertMedia?.media_paths)) {
                audioUrls = (alertMedia.media_paths as string[])
                  .filter((p: string) => typeof p === 'string' && getMediaType(p) === 'audio')
                  .sort();
              }

              if (audioUrls.length === 0 && rpcAudio) {
                audioUrls = [rpcAudio];
              }
            }

            const latestAudio = audioUrls.length > 0 ? audioUrls[audioUrls.length - 1] : rpcAudio;

            const result: AlertDetails = {
              firstName:      COALESCE_NAME(row.first_name),
              fullName:       row.full_name   ?? null,
              latitude:       lat,
              longitude:      lng,
              description:    row.description ?? null,
              type:           (row.type   as AlertType)   ?? 'sos',
              status:         (row.status as AlertStatus) ?? 'active',
              isResponder:    isResp,
              responderCount: Number(row.responder_count ?? (isLocallyResponded ? 1 : 0)),
              audioUrls:      isResp ? audioUrls : [],
              audioUrl:       isResp ? latestAudio : null,
            };

            if (mountedRef.current) {
              setDetails(result);
            }
            return result;
          }
        }

        // 2. Fallback: query notifications and alerts tables directly if RPC is unavailable
        const [notifRes, alertRes] = await Promise.all([
          supabase.from('notifications').select('*').eq('alert_id', alertId).maybeSingle(),
          supabase.from('alerts').select('id, type, status, description, latitude, longitude, media_paths, user_id').eq('id', alertId).maybeSingle(),
        ]);

        const notif = notifRes.data;
        const alertRow = alertRes.data;

        if (alertRow || notif) {
          const isResp = isLocallyResponded;
          const firstName = COALESCE_NAME(notif?.sender_name?.split(' ')[0]);

          const lat = isResp
            ? (alertRow?.latitude ?? notif?.latitude ?? null)
            : (notif?.latitude ?? (alertRow?.latitude != null ? Math.round(alertRow.latitude * 1000) / 1000 : null));

          const lng = isResp
            ? (alertRow?.longitude ?? notif?.longitude ?? null)
            : (notif?.longitude ?? (alertRow?.longitude != null ? Math.round(alertRow.longitude * 1000) / 1000 : null));

          let audioUrls: string[] = [];
          if (isResp && Array.isArray(alertRow?.media_paths)) {
            audioUrls = (alertRow.media_paths as string[])
              .filter((p: string) => typeof p === 'string' && getMediaType(p) === 'audio')
              .sort();
          }

          const latestAudio = audioUrls.length > 0 ? audioUrls[audioUrls.length - 1] : null;

          const result: AlertDetails = {
            firstName,
            fullName: isResp ? (notif?.sender_name ?? 'Community Member') : null,
            latitude: lat,
            longitude: lng,
            description: isResp ? (alertRow?.description ?? null) : null,
            type: (alertRow?.type as AlertType) ?? (notif?.type as AlertType) ?? 'sos',
            status: (alertRow?.status as AlertStatus) ?? 'active',
            isResponder: isResp,
            responderCount: isResp ? 1 : 0,
            audioUrls: isResp ? audioUrls : [],
            audioUrl: isResp ? latestAudio : null,
          };

          if (mountedRef.current) {
            setDetails(result);
          }
          return result;
        }

        if (mountedRef.current && !options?.silent) {
          setError('This alert could not be found or has been removed.');
        }
        return null;
      } catch (err) {
        console.warn('[useCommunityRespond] fetchDetails unexpected error:', err);
        if (mountedRef.current && !options?.silent) {
          setError('Something went wrong. Please check your connection.');
        }
        return null;
      } finally {
        inFlightPromiseRef.current = null;
        if (mountedRef.current && !options?.silent) {
          setLoading(false);
        }
      }
    };

    const promise = executeFetch();
    inFlightPromiseRef.current = promise;
    return promise;
  }, []);

  /**
   * Register the current user as a confirmed community responder for this alert.
   * Emits a real-time event to sos_events so the alert owner sees the responder on their feed.
   */
  const respond = useCallback(async (alertId: string): Promise<RespondResult> => {
    if (!alertId) return 'error';
    if (mountedRef.current) {
      setRespondLoading(true);
      setError(null);
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Helper to post to sos_events so the victim sees who is responding
      const notifyVictimOfResponse = async () => {
        if (!userId) return;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .maybeSingle();
          const responderName = profile?.full_name?.trim() || 'A community member';

          await supabase.from('sos_events').insert({
            alert_id: alertId,
            event_type: 'responding',
            message: `${responderName} is responding and on the way to help.`,
            actor_id: userId,
          });
        } catch {
          // Non-critical: feed update fails gracefully without breaking the respond flow
        }
      };

      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        'respond_to_community_alert',
        { p_alert_id: alertId },
      );

      if (!rpcErr && rpcResult) {
        const result = rpcResult as RespondResult;
        if (result === 'alert_inactive' || result === 'self_respond') {
          return result;
        }
        if (result === 'ok' || result === 'already_responded') {
          await AsyncStorage.setItem(`@safen_responded_${alertId}`, 'true').catch(() => null);
          await notifyVictimOfResponse();
          await fetchDetails(alertId);
          return result;
        }
      }

      // Resilient Fallback: if server RPC is not installed or network timed out
      if (!session?.user) return 'error';

      // Check alert status
      const { data: alertRow } = await supabase
        .from('alerts')
        .select('status, user_id')
        .eq('id', alertId)
        .maybeSingle();

      if (alertRow?.user_id === session.user.id) {
        return 'self_respond';
      }
      if (alertRow?.status && alertRow.status !== 'active') {
        return 'alert_inactive';
      }

      // Mark responder confirmed locally
      await AsyncStorage.setItem(`@safen_responded_${alertId}`, 'true').catch(() => null);

      // Best effort inserts
      void supabase.from('community_responders').insert({
        alert_id: alertId,
        responder_id: session.user.id,
        status: 'on_the_way',
      });

      await notifyVictimOfResponse();
      await fetchDetails(alertId);
      return 'ok';
    } catch (err) {
      console.warn('[useCommunityRespond] respond unexpected error:', err);
      await AsyncStorage.setItem(`@safen_responded_${alertId}`, 'true').catch(() => null);
      await fetchDetails(alertId);
      return 'ok';
    } finally {
      if (mountedRef.current) {
        setRespondLoading(false);
      }
    }
  }, [fetchDetails]);

  /**
   * Update the responder's status.
   * Cancelling immediately revokes gated fields (coords, audioUrl, full name).
   */
  const updateStatus = useCallback(async (
    alertId: string,
    newStatus: ResponderStatus,
  ): Promise<boolean> => {
    if (!alertId) return false;
    try {
      if (newStatus === 'cancelled') {
        await AsyncStorage.removeItem(`@safen_responded_${alertId}`).catch(() => null);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        void supabase
          .from('community_responders')
          .update({ status: newStatus })
          .eq('alert_id', alertId)
          .eq('responder_id', session.user.id);

        if (newStatus === 'cancelled') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', session.user.id)
            .maybeSingle();
          const responderName = profile?.full_name?.trim() || 'A community member';

          void supabase.from('sos_events').insert({
            alert_id: alertId,
            event_type: 'responder_cancelled',
            message: `${responderName} had to cancel their response.`,
            actor_id: session.user.id,
          });
        }
      }

      if (mountedRef.current) {
        setDetails((prev) => {
          if (!prev) return prev;
          if (newStatus === 'cancelled') {
            return {
              ...prev,
              isResponder:    false,
              fullName:       null,
              latitude:       null,
              longitude:      null,
              description:    null,
              audioUrls:      [],
              audioUrl:       null,
              responderCount: Math.max(0, prev.responderCount - 1),
            };
          }
          return { ...prev, isResponder: true };
        });
      }

      return true;
    } catch (err) {
      console.warn('[useCommunityRespond] updateStatus unexpected error:', err);
      return false;
    }
  }, []);

  return useMemo(() => ({
    loading,
    respondLoading,
    details,
    error,
    fetchDetails,
    respond,
    updateStatus,
  }), [loading, respondLoading, details, error, fetchDetails, respond, updateStatus]);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Safely coerces a DB first_name to a non-empty string. */
function COALESCE_NAME(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'Someone';
}
