import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useNotifications, type AppNotification } from '../hooks/useNotifications';
import { getDistanceMeters } from '../utils/location';
import { timeAgo } from '../utils/dateUtils';
import type { ThemeColors } from '../constants/Theme';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  (UIManager as any).setLayoutAnimationEnabledExperimental(true);
}

const DISMISSED_BANNERS_STORAGE_KEY = '@safen_dismissed_community_banners';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function formatApproxDistance(metres: number): string {
  if (metres < 1000) return `~${Math.round(metres)}m away`;
  return `~${(metres / 1000).toFixed(1)}km away`;
}

export const CommunityAlertBanner = React.memo(function CommunityAlertBanner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { notifications } = useNotifications();

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Pulse animation for the emergency badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load dismissed alert IDs
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISMISSED_BANNERS_STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setDismissedIds(parsed);
          }
        }
      } catch {
        // Fallback: empty array
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch caller's approximate position (read-only permission check, best-effort)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || !mounted) return;

        const pos =
          await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null)
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

        if (pos && mounted) {
          setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        // Non-critical: approximate distance will be omitted gracefully
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Build a set of alert_ids that have been cancelled/resolved
  // so we can exclude the original alert notification even if it's still in the list.
  const cancelledAlertIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      if (n.alert_id && (n.title.startsWith('\u2705') || n.title.startsWith('✅'))) {
        ids.add(n.alert_id);
      }
    }
    return ids;
  }, [notifications]);

  // Identify all active community alerts (newest-first), excluding cancelled and dismissed
  const activeAlerts = useMemo<AppNotification[]>(() => {
    const now = Date.now();
    return notifications.filter((n) => {
      if (!n.is_community_broadcast || !n.alert_id) return false;
      if (n.title.startsWith('\u2705') || n.title.startsWith('✅')) return false; // skip cancellation rows
      if (cancelledAlertIds.has(n.alert_id)) return false; // alert was subsequently cancelled
      if (dismissedIds.includes(n.alert_id)) return false;
      const alertTime = new Date(n.created_at).getTime();
      if (isNaN(alertTime) || now - alertTime > TWO_HOURS_MS) return false;
      return true;
    });
  }, [notifications, dismissedIds, cancelledAlertIds]);

  // Derive the primary alert to show (most recent active alert)
  const activeAlert = activeAlerts[0] ?? null;
  // Count of additional pending alerts
  const extraCount = Math.max(0, activeAlerts.length - 1);

  // Auto-collapse if count drops to 1 or below
  useEffect(() => {
    if (activeAlerts.length <= 1 && isExpanded) {
      setIsExpanded(false);
    }
  }, [activeAlerts.length, isExpanded]);

  // Pulse loop while active alert is present
  useEffect(() => {
    if (!activeAlert) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeAlert, pulseAnim]);

  // Compute approximate distance for any alert
  const getAlertDistanceStr = useCallback(
    (alert: AppNotification): string | null => {
      if (!myCoords || alert.latitude == null || alert.longitude == null) return null;
      const metres = getDistanceMeters(
        myCoords.lat,
        myCoords.lng,
        alert.latitude,
        alert.longitude
      );
      return formatApproxDistance(metres);
    },
    [myCoords]
  );

  const primaryDistanceStr = useMemo(() => {
    if (!activeAlert) return null;
    return getAlertDistanceStr(activeAlert);
  }, [activeAlert, getAlertDistanceStr]);

  // Toggle expanded alerts list
  const toggleExpanded = useCallback(() => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {
      // ignore
    }
    setIsExpanded((prev) => !prev);
  }, []);

  // Handlers
  const handleDismissAlert = useCallback((alertId: string) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {
      // ignore
    }
    setDismissedIds((prev) => {
      if (prev.includes(alertId)) return prev;
      const updated = [...prev, alertId];
      AsyncStorage.setItem(DISMISSED_BANNERS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const handleNavigateToAlert = useCallback(
    (alertId: string) => {
      router.push(`/community-alert/${alertId}`);
    },
    [router]
  );

  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  if (!activeAlert) return null;

  const senderName = activeAlert.sender_name || 'Someone';

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel={`Community Emergency Alerts: ${activeAlerts.length} active emergency alert${
        activeAlerts.length > 1 ? 's' : ''
      }`}
    >
      {/* ── EXPANDED VIEW: Multi-Alert List ── */}
      {isExpanded ? (
        <View style={styles.expandedContainer}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>
                ACTIVE ALERTS ({activeAlerts.length})
              </Text>
            </View>

            <TouchableOpacity
              onPress={toggleExpanded}
              style={styles.collapseToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Collapse alert list"
            >
              <Text style={styles.collapseToggleText}>Collapse</Text>
              <Ionicons name="chevron-up" size={16} color={isDark ? '#FCA5A5' : '#DC2626'} />
            </TouchableOpacity>
          </View>

          {/* Alert Cards */}
          <View style={styles.listContainer}>
            {activeAlerts.map((item, index) => {
              const itemDistance = getAlertDistanceStr(item);
              const itemName = item.sender_name || 'Someone';
              const alertId = item.alert_id!;

              return (
                <View
                  key={alertId}
                  style={[styles.listItem, index > 0 && styles.listItemBorder]}
                >
                  <View style={styles.listItemTop}>
                    <View style={styles.listItemLeft}>
                      <View style={styles.itemIconCircle}>
                        <Ionicons name="alert" size={14} color="#FFFFFF" />
                      </View>
                      <View style={styles.itemTextContainer}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {itemName} needs assistance
                        </Text>
                        <View style={styles.distanceRow}>
                          <Ionicons name="location-sharp" size={13} color="#EF4444" />
                          <Text style={styles.distanceText}>
                            {itemDistance || 'Nearby community member'}
                          </Text>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Individual Dismiss Button */}
                    <TouchableOpacity
                      onPress={() => handleDismissAlert(alertId)}
                      style={styles.dismissBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Dismiss alert for ${itemName}`}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={isDark ? '#9CA3AF' : '#6B7280'}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Individual Alert CTA */}
                  <TouchableOpacity
                    style={styles.itemCta}
                    onPress={() => handleNavigateToAlert(alertId)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`View alert and respond to ${itemName}`}
                  >
                    <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
                    <Text style={styles.itemCtaText}>View Alert & Respond</Text>
                    <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        /* ── COLLAPSED VIEW: Primary Alert Card ── */
        <>
          {/* Top Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>EMERGENCY NEARBY</Text>
            </View>

            <View style={styles.headerRight}>
              <Text style={styles.timeText}>{timeAgo(activeAlert.created_at)}</Text>
              <TouchableOpacity
                onPress={() => handleDismissAlert(activeAlert.alert_id!)}
                style={styles.dismissBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss community alert banner"
              >
                <Ionicons name="close" size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Body */}
          <TouchableOpacity
            style={styles.bodyRow}
            onPress={() => handleNavigateToAlert(activeAlert.alert_id!)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View alert details for ${senderName}`}
          >
            <Animated.View
              style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}
            >
              <Ionicons name="alert" size={22} color="#FFFFFF" />
            </Animated.View>

            <View style={styles.textContainer}>
              <Text style={styles.titleText} numberOfLines={1}>
                {senderName} needs assistance
              </Text>
              <View style={styles.distanceRow}>
                <Ionicons name="location-sharp" size={14} color="#EF4444" />
                <Text style={styles.distanceText}>
                  {primaryDistanceStr ? primaryDistanceStr : 'Nearby community member'}
                </Text>
                {extraCount > 0 && (
                  <TouchableOpacity
                    onPress={toggleExpanded}
                    style={styles.extraBadge}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`View all ${activeAlerts.length} alerts`}
                  >
                    <Text style={styles.extraBadgeText}>+{extraCount} more</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* Action CTA */}
          <TouchableOpacity
            style={styles.respondCta}
            onPress={() => handleNavigateToAlert(activeAlert.alert_id!)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Respond to community alert"
          >
            <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
            <Text style={styles.respondCtaText}>View Alert & Respond</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Expand Toggle: when multiple alerts are pending */}
          {extraCount > 0 && (
            <TouchableOpacity
              style={styles.viewAllToggle}
              onPress={toggleExpanded}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`View all ${activeAlerts.length} active emergency alerts`}
            >
              <Text style={styles.viewAllToggleText}>
                View all {activeAlerts.length} active emergency alerts
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={isDark ? '#FCA5A5' : '#DC2626'}
              />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
});

CommunityAlertBanner.displayName = 'CommunityAlertBanner';

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? '#2D0A0A' : '#FEF2F2',
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: '#EF4444',
      borderLeftWidth: 5,
      borderLeftColor: '#DC2626',
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 14,
      shadowColor: '#DC2626',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.15,
      shadowRadius: 6,
      elevation: 4,
    },
    expandedContainer: {
      gap: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    badgePill: {
      backgroundColor: '#DC2626',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    badgePillText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timeText: {
      fontSize: 11,
      color: isDark ? '#D1D5DB' : '#6B7280',
      fontWeight: '500',
    },
    metaDot: {
      fontSize: 11,
      color: isDark ? '#6B7280' : '#9CA3AF',
      marginHorizontal: 2,
    },
    dismissBtn: {
      padding: 3,
    },
    collapseToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    collapseToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    bodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#DC2626',
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    titleText: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
      marginBottom: 3,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
    },
    distanceText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    extraBadge: {
      backgroundColor: '#DC2626',
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
      marginLeft: 4,
    },
    extraBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    respondCta: {
      backgroundColor: '#DC2626',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    respondCtaText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    viewAllToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 8,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)',
    },
    viewAllToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    /* List styles inside expanded view */
    listContainer: {
      gap: 8,
    },
    listItem: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.65)',
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
    },
    listItemBorder: {
      marginTop: 4,
    },
    listItemTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
    },
    listItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    itemIconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#DC2626',
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTextContainer: {
      flex: 1,
    },
    itemTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
      marginBottom: 2,
    },
    itemCta: {
      backgroundColor: '#DC2626',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 7,
      borderRadius: 8,
    },
    itemCtaText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
  });
