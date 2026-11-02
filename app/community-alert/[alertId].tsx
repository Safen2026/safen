import { customAlert } from '../../src/utils/customAlert';
import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import { useCommunityRespond } from '../../src/hooks/useCommunityRespond';
import type { AlertType } from '../../src/hooks/useCommunityRespond';
import { EmergencyAudioPlayer } from '../../src/components/EmergencyAudioPlayer';
import { CancelResponseModal } from '../../src/components/CancelResponseModal';
import { Shadows } from '../../src/constants/Theme';

// ── Constants ─────────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type AlertMeta = { icon: IconName; color: string; label: string };

const ALERT_META: Record<AlertType, AlertMeta> = {
  sos:     { icon: 'alert-circle',         color: '#E02B2B', label: 'SOS Emergency'     },
  medical: { icon: 'medical-bag',          color: '#DC2626', label: 'Medical Emergency'  },
  police:  { icon: 'police-badge-outline', color: '#2563EB', label: 'Police Alert'       },
  fire:    { icon: 'fire',                 color: '#EA580C', label: 'Fire Emergency'     },
};
const DEFAULT_META = ALERT_META.sos;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Haversine formula: straight-line distance in metres between two lat/lng pairs.
 * Both coordinate pairs must be valid (non-null, finite) — callers must guard.
 */
function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `~${Math.round(metres)}m away`;
  return `~${(metres / 1000).toFixed(1)}km away`;
}

function buildMapsUrl(lat: number, lng: number): string {
  if (Platform.OS === 'ios') {
    return `maps://?daddr=${lat},${lng}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CommunityAlertScreen() {
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const router      = useRouter();
  const { colors, isDark } = useTheme();

  const {
    loading, respondLoading, details, error,
    fetchDetails, respond, updateStatus,
  } = useCommunityRespond();

  // Caller's GPS position for approximate distance display.
  // Only used for UX — never transmitted.
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const gpsFetchingRef = useRef(false);

  // isMounted guard: prevents setState after unmount during async GPS call
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Side-effects ───────────────────────────────────────────────────────────

  /**
   * Fetches the caller's approximate location.
   * Tries last-known (instant) first, then fresh with a 5-second timeout.
   * No-op if already fetching. Never triggers an OS permission dialog.
   */
  const fetchMyLocation = useCallback(async () => {
    if (gpsFetchingRef.current) return;
    gpsFetchingRef.current = true;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || !mountedRef.current) return;

      if (mountedRef.current) setGpsLoading(true);

      // 1. Last-known position — instant, no network needed
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
      if (cached && mountedRef.current) {
        setMyCoords({ lat: cached.coords.latitude, lng: cached.coords.longitude });
        return;
      }

      // 2. Fresh fix with 5s timeout so it never hangs indefinitely
      const result = await Promise.race<Location.LocationObject | null>([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
      ]);
      if (result && mountedRef.current) {
        setMyCoords({ lat: result.coords.latitude, lng: result.coords.longitude });
      }
    } catch {
      // Non-critical — distance row shows fallback text
    } finally {
      gpsFetchingRef.current = false;
      if (mountedRef.current) setGpsLoading(false);
    }
  }, []);

  // 1. Initial location fetch on mount
  useEffect(() => {
    void fetchMyLocation();
  }, [fetchMyLocation]);

  // ── Derived values (memoised) ─────────────────────────────────────────────

  const meta = useMemo<AlertMeta>(
    () => (details?.type ? ALERT_META[details.type] ?? DEFAULT_META : DEFAULT_META),
    [details?.type],
  );

  // Use server-authoritative isResponder as single source of truth for phase
  const isResponder = Boolean(details?.isResponder);

  const approxDistance = useMemo<string | null>(() => {
    if (!myCoords || details?.latitude == null || details?.longitude == null) return null;
    const metres = haversineMetres(
      myCoords.lat, myCoords.lng,
      details.latitude, details.longitude,
    );
    return formatDistance(metres);
  }, [myCoords, details?.latitude, details?.longitude]);

  // Distance display text:
  // • Phase 1: "Approximate location only"
  // • Phase 2, GPS resolved: distance string
  // • Phase 2, GPS loading: "Locating you…"
  // • Phase 2, GPS timed out but destination coords known: "Ready to navigate"
  const distanceDisplayText = useMemo<string>(() => {
    if (approxDistance) return approxDistance;
    if (!isResponder) return 'Approximate location only';
    if (gpsLoading) return 'Locating you…';
    if (details?.latitude != null && details?.longitude != null) return 'Ready to navigate';
    return 'Locating destination…';
  }, [approxDistance, isResponder, gpsLoading, details?.latitude, details?.longitude]);

  // Re-fetch GPS when user becomes a responder so Phase 2 distance shows immediately
  const isResponderRef = useRef(isResponder);
  useEffect(() => {
    if (isResponder && !isResponderRef.current && !myCoords) {
      void fetchMyLocation();
    }
    isResponderRef.current = isResponder;
  }, [isResponder, myCoords, fetchMyLocation]);

  const isResolved = useMemo(
    () => details?.status === 'cancelled' || details?.status === 'resolved',
    [details?.status],
  );

  const themeStyles = useMemo(() => ({
    bg: { backgroundColor: colors.background },
    header: { backgroundColor: colors.white, borderBottomColor: colors.border },
    headerTitle: { color: colors.text.primary },
    typeBadge: { backgroundColor: meta.color + '18' },
    typeLabel: { color: meta.color },
    resolvedBanner: { backgroundColor: colors.status.safeBackground },
    resolvedText: { color: colors.status.safeText },
    card: { backgroundColor: colors.white, borderColor: colors.border },
    avatarCircle: { backgroundColor: meta.color + '20' },
    personName: { color: colors.text.primary },
    textSecondary: { color: colors.text.secondary },
    divider: { backgroundColor: colors.border },
    privacyNote: {
      backgroundColor: isDark ? '#1a1a2a' : '#F0F4FF',
      borderColor:     isDark ? '#2a2a4a' : '#C7D2FE',
    },
    privacyText: { color: isDark ? '#A5B4FC' : '#4F46E5' },
    primaryBtn: { backgroundColor: meta.color },
    accentText: { color: meta.color },
    cancelBtn: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
    },
    cancelText: {
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    safeBtn: { backgroundColor: colors.status.safeBackground },
  }), [colors, meta.color, isDark]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleManualRefresh = useCallback(async () => {
    if (!alertId || refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchDetails(alertId, { silent: true }),
        fetchMyLocation(),
      ]);
    } catch {
      // Non-critical — silent refresh
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [alertId, refreshing, fetchDetails, fetchMyLocation]);

  const handleRetry = useCallback(() => {
    if (alertId) void fetchDetails(alertId);
  }, [alertId, fetchDetails]);

  const handleRespond = useCallback(async () => {
    if (!alertId) return;
    const result = await respond(alertId);

    switch (result) {
      case 'alert_inactive':
        customAlert(
          'Alert Resolved',
          'This emergency has already been resolved. No further action is needed.',
          [{ text: 'OK', onPress: handleBack }],
        );
        break;
      case 'self_respond':
        // Should never appear in practice (owner doesn't receive community broadcasts),
        // but handle gracefully just in case.
        customAlert('Not Applicable', 'You cannot respond to your own alert.');
        break;
      case 'error':
        customAlert('Error', 'Could not register your response. Please try again.');
        break;
      // 'ok' | 'already_responded': details are now Phase 2 — no extra action needed.
      // UI derives from details.isResponder (server-authoritative).
    }
  }, [alertId, respond, handleBack]);

  const handleOpenMaps = useCallback(async () => {
    if (details?.latitude == null || details?.longitude == null) return;
    const url = buildMapsUrl(details.latitude, details.longitude);
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${details.latitude},${details.longitude}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(fallback);
      }
    } catch {
      await Linking.openURL(fallback).catch(() => {});
    }
  }, [details?.latitude, details?.longitude]);

  const handleCancelResponse = useCallback(() => {
    setCancelModalVisible(true);
  }, []);

  const handleKeepHelping = useCallback(() => {
    setCancelModalVisible(false);
  }, []);

  const handleConfirmCancel = useCallback(async () => {
    if (!alertId) return;
    setCancelling(true);
    try {
      await updateStatus(alertId, 'cancelled');
      setCancelModalVisible(false);
      handleBack();
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }, [alertId, updateStatus, handleBack]);

  // ── Side-effects ───────────────────────────────────────────────────────────

  // 2a. Initial fetch on mount — runs exactly once per alertId.
  useEffect(() => {
    if (!alertId) return;
    void fetchDetails(alertId);
  }, [alertId, fetchDetails]);

  // 2b. Background polling while the alert is active.
  //     Effect restarts only when alertId changes. Inside, we check the latest
  //     details via a ref so the interval callback sees up-to-date state without
  //     needing to be listed as a dep (which would restart polling on every fetch).
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => {
    if (!alertId) return;

    const interval = setInterval(() => {
      // Stop polling once the server tells us the alert is resolved
      const currentStatus = detailsRef.current?.status;
      if (currentStatus === 'cancelled' || currentStatus === 'resolved') {
        clearInterval(interval);
        return;
      }
      void fetchDetails(alertId, { silent: true });
    }, 15_000);

    return () => clearInterval(interval);
  }, [alertId, fetchDetails]);

  // 2c. Realtime subscription for live alert updates (media, audio_url, coordinates, status)
  useEffect(() => {
    if (!alertId) return;

    const channel = supabase
      .channel(`community_alert_realtime_${alertId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
          filter: `id=eq.${alertId}`,
        },
        () => {
          if (!mountedRef.current) return;
          void fetchDetails(alertId, { silent: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_responders',
          filter: `alert_id=eq.${alertId}`,
        },
        () => {
          if (!mountedRef.current) return;
          void fetchDetails(alertId, { silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [alertId, fetchDetails]);

  // ── Render: loading ────────────────────────────────────────────────────────

  if (loading && !details) {
    return (
      <View
        style={[styles.centered, themeStyles.bg]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading alert details"
      >
        <ActivityIndicator size="large" color={meta.color} />
        <Text style={[styles.loadingText, themeStyles.textSecondary]}>
          Loading alert details…
        </Text>
      </View>
    );
  }

  // ── Render: error (no data at all) ────────────────────────────────────────

  if (error && !details) {
    return (
      <View
        style={[styles.centered, themeStyles.bg]}
        accessibilityRole="alert"
        accessibilityLabel={error}
      >
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.text.secondary} />
        <Text style={[styles.errorText, themeStyles.textSecondary]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, themeStyles.primaryBtn]}
          onPress={handleRetry}
          accessibilityLabel="Retry loading alert details"
          accessibilityRole="button"
          testID="community-retry-button"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, themeStyles.bg]}>

      {/* ── Header ── */}
      <View style={[styles.header, themeStyles.header]}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.headerTitle]} accessibilityRole="header">
          Community Alert
        </Text>
        <TouchableOpacity
          onPress={handleManualRefresh}
          disabled={refreshing}
          style={styles.headerActionBtn}
          accessibilityLabel="Refresh alert details and media"
          accessibilityRole="button"
          testID="community-alert-refresh-btn"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={meta.color} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={22} color={colors.text.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleManualRefresh}
            tintColor={meta.color}
            colors={[meta.color]}
          />
        }
      >

        {/* ── Alert type badge ── */}
        <View style={[styles.typeBadge, themeStyles.typeBadge]}>
          <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
          <Text style={[styles.typeLabel, themeStyles.typeLabel]}>{meta.label}</Text>
        </View>

        {/* ── Resolved banner ── */}
        {isResolved && (
          <View
            style={[styles.resolvedBanner, themeStyles.resolvedBanner]}
            accessibilityRole="alert"
          >
            <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.status.safeText} />
            <Text style={[styles.resolvedText, themeStyles.resolvedText]}>
              This emergency has been resolved. Thank you to everyone who responded.
            </Text>
          </View>
        )}

        {/* ── Main info card ── */}
        <View style={[styles.card, themeStyles.card, Shadows.md]}>

          {/* Person row — Phase 1: first name; Phase 2: full name */}
          <View style={styles.personRow}>
            <View style={[styles.avatarCircle, themeStyles.avatarCircle]}>
              <MaterialCommunityIcons name="account" size={30} color={meta.color} />
            </View>
            <View style={styles.personInfo}>
              <Text style={[styles.personName, themeStyles.personName]}>
                {isResponder && details?.fullName ? details.fullName : (details?.firstName ?? 'Someone')}
                {!isResponder && (
                  <Text style={[styles.nameHint, themeStyles.textSecondary]}> needs help</Text>
                )}
              </Text>
              {isResponder && (
                <View style={styles.respondedPill}>
                  <MaterialCommunityIcons name="check-circle" size={13} color="#16A34A" />
                  <Text style={styles.respondedPillText}>You're responding</Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.divider, themeStyles.divider]} />

          {/* Distance row */}
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="map-marker-distance" size={20} color={colors.text.secondary} />
            <View style={styles.infoTextGroup}>
              <Text style={[styles.infoLabel, themeStyles.textSecondary]}>Distance</Text>
              <Text style={[styles.infoValue, themeStyles.headerTitle]}>
                {distanceDisplayText}
              </Text>
              {!isResponder && (
                <Text style={[styles.infoHint, themeStyles.textSecondary]}>
                  Tap "I'm Responding" to unlock exact location
                </Text>
              )}
            </View>
          </View>

          {/* Exact coordinates (Phase 2 only) — informative, Navigate There button below is primary CTA */}
          {isResponder && details?.latitude != null && details?.longitude != null && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="map-marker" size={20} color={meta.color} />
              <View style={styles.infoTextGroup}>
                <Text style={[styles.infoLabel, themeStyles.textSecondary]}>Exact Coordinates</Text>
                <Text style={[styles.infoValue, themeStyles.headerTitle]}>
                  {details.latitude.toFixed(5)}, {details.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          )}

          {/* Description (Phase 2 only) */}
          {isResponder && details?.description ? (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="text-box-outline" size={20} color={colors.text.secondary} />
              <View style={styles.infoTextGroup}>
                <Text style={[styles.infoLabel, themeStyles.textSecondary]}>Details</Text>
                <Text style={[styles.infoValue, themeStyles.headerTitle]}>
                  {details.description}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Responder count (visible to all, always) */}
          {(details?.responderCount ?? 0) > 0 && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="account-group" size={20} color={colors.text.secondary} />
              <View style={styles.infoTextGroup}>
                <Text style={[styles.infoLabel, themeStyles.textSecondary]}>Community Response</Text>
                <Text style={[styles.infoValue, themeStyles.headerTitle]}>
                  {details!.responderCount}{' '}
                  {details!.responderCount === 1 ? 'person is' : 'people are'} already helping
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Privacy disclosure (Phase 1 only) ── */}
        {!isResponder && (
          <View
            style={[styles.privacyNote, themeStyles.privacyNote]}
            accessibilityRole="text"
            accessibilityLabel="Privacy disclosure"
          >
            <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#6366F1" />
            <Text style={[styles.privacyText, themeStyles.privacyText]}>
              Exact location and full details are only shared after you confirm you're
              responding. Your identity will be visible to the person in need.
            </Text>
          </View>
        )}

        {/* ── Action buttons ── */}

        {/* Phase 1 CTA */}
        {!isResolved && !isResponder && (
          <TouchableOpacity
            style={[styles.primaryBtn, themeStyles.primaryBtn, respondLoading && styles.btnDisabled]}
            onPress={handleRespond}
            disabled={respondLoading}
            accessibilityLabel="I am responding to this emergency"
            accessibilityRole="button"
            testID="community-respond-button"
          >
            {respondLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="run-fast" size={22} color="#FFF" />
                <Text style={styles.primaryBtnText}>I'm Responding</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ── Audio Context Player / Live Status (Responder-Only) ── */}
        {isResponder && !isResolved && (
          <EmergencyAudioPlayer
            audioUrls={details?.audioUrls}
            onRefresh={handleManualRefresh}
            isRefreshing={refreshing}
          />
        )}

        {/* Phase 2 CTAs */}
        {isResponder && !isResolved && (
          <>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                themeStyles.primaryBtn,
                (!details?.latitude || !details?.longitude) && styles.btnDisabled,
              ]}
              onPress={handleOpenMaps}
              disabled={!details?.latitude || !details?.longitude}
              activeOpacity={0.85}
              accessibilityLabel="Open exact location in turn-by-turn Maps navigation"
              accessibilityRole="button"
              testID="community-navigate-button"
            >
              <MaterialCommunityIcons name="navigation" size={20} color="#FFF" />
              <Text style={styles.primaryBtnText}>Navigate There</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelResponseBtn, themeStyles.cancelBtn]}
              onPress={handleCancelResponse}
              activeOpacity={0.7}
              accessibilityLabel="Cancel my response to this emergency"
              accessibilityRole="button"
              testID="community-cancel-response-button"
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={18}
                color={isDark ? '#FCA5A5' : '#DC2626'}
              />
              <Text style={[styles.cancelResponseText, themeStyles.cancelText]}>
                Cancel My Response
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Resolved state */}
        {isResolved && (
          <TouchableOpacity
            style={[styles.primaryBtn, themeStyles.safeBtn]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Situation resolved. Go back."
          >
            <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.status.safeText} />
            <Text style={[styles.primaryBtnText, themeStyles.resolvedText]}>
              Situation Resolved — Go Back
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Custom Confirmation Modal for Cancelling Response */}
      <CancelResponseModal
        visible={cancelModalVisible}
        loading={cancelling}
        onKeepHelping={handleKeepHelping}
        onConfirmCancel={handleConfirmCancel}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn:         { padding: 4 },
  headerTitle:     { fontSize: 18, fontWeight: '700' },
  headerActionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer:          { width: 36 },
  // ── Scroll content
  scroll: {
    padding: 20,
    gap: 16,
  },
  // ── Alert type badge
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 4,
  },
  typeLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  // ── Resolved banner
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  resolvedText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  // ── Main card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInfo: {
    flex: 1,
    gap: 4,
  },
  personName: {
    fontSize: 20,
    fontWeight: '700',
  },
  nameHint: {
    fontSize: 16,
    fontWeight: '400',
  },
  respondedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  respondedPillText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: { height: 1 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoTextGroup: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  infoHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  // ── Privacy note
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  // ── CTA buttons (merged mapsBtn + respondBtn → primaryBtn, DRY fix)
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  cancelResponseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 10,
  },
  cancelResponseText: {
    fontSize: 15,
    fontWeight: '700',
  },
  bottomPad: { height: 40 },
});
