/**
 * IncidentDrawer.tsx
 *
 * A floating bottom panel that lists nearby active incidents detected by the
 * Safety Radar. Appears above the ActiveTripShareCard when both are visible.
 *
 * States:
 *  - Loading  → spinner
 *  - Empty    → "All quiet" illustration
 *  - Has alerts → horizontal-scrollable pill list of incidents (closest first)
 *
 * Tapping an incident pill:
 *  1. Selects it (updates selectedAlertId → triggers breadcrumb fetch)
 *  2. Animates the map camera to that pin
 *
 * Tapping again (or a different pin) deselects / switches selection.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/Theme';
import { Shadows } from '../../constants/Theme';
import type { RadarAlert } from '../../hooks/useRadarAlerts';

// ── Config: colours + labels per alert type ───────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TypeConfig {
  color: string;
  label: string;
  icon: IoniconsName;
}

const TYPE_CONFIG: Record<RadarAlert['type'], TypeConfig> = {
  sos:     { color: '#E02B2B', label: 'SOS Alert',       icon: 'alert-circle' },
  medical: { color: '#DC2626', label: 'Medical',         icon: 'medkit' },
  police:  { color: '#2563EB', label: 'Police/Security', icon: 'shield' },
  fire:    { color: '#EA580C', label: 'Fire',            icon: 'flame' },
};

// ── Helper: format distance ───────────────────────────────────────────────────

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

// ── Helper: format elapsed time ───────────────────────────────────────────────

function formatElapsed(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Incident pill ─────────────────────────────────────────────────────────────

interface IncidentPillProps {
  alert: RadarAlert;
  isSelected: boolean;
  onPress: (alert: RadarAlert) => void;
  colors: ThemeColors;
}

const IncidentPill = React.memo(
  ({ alert, isSelected, onPress, colors }: IncidentPillProps) => {
    const cfg = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.sos;
    const styles = pillStyles(colors, cfg.color, isSelected);

    return (
      <TouchableOpacity
        style={styles.pill}
        onPress={() => onPress(alert)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${cfg.label}, ${formatDistance(alert.distanceMeters)}`}
      >
        {/* Icon circle */}
        <View style={styles.iconCircle}>
          <Ionicons name={cfg.icon} size={14} color={isSelected ? '#FFF' : cfg.color} />
        </View>

        {/* Text */}
        <View style={styles.pillText}>
          <Text style={styles.pillType} numberOfLines={1}>
            {alert.isOwn ? `Your ${cfg.label}` : cfg.label}
          </Text>
          <Text style={styles.pillMeta} numberOfLines={1}>
            {alert.isOwn ? 'Your location' : formatDistance(alert.distanceMeters)}
            {!alert.isOwn && alert.senderName ? ` · ${alert.senderName}` : ''}
          </Text>
        </View>

        {/* Elapsed badge */}
        <Text style={styles.pillTime}>{formatElapsed(alert.createdAt)}</Text>
      </TouchableOpacity>
    );
  }
);

IncidentPill.displayName = 'IncidentPill';

// ── Main component ─────────────────────────────────────────────────────────────

interface IncidentDrawerProps {
  alerts: RadarAlert[];
  loading: boolean;
  selectedAlertId: string | null;
  onPinSelect: (alert: RadarAlert) => void;
  onRespondPress?: (alert: RadarAlert) => void;
}

export const IncidentDrawer = React.memo(
  ({ alerts, loading, selectedAlertId, onPinSelect, onRespondPress }: IncidentDrawerProps) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);

    const handlePillPress = useCallback(
      (alert: RadarAlert) => {
        onPinSelect(alert);
      },
      [onPinSelect]
    );

    const selectedAlert = alerts.find((a) => a.id === selectedAlertId);

    return (
      <View style={styles.drawer}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.radarBadge}>
            <View style={styles.radarDot} />
            <Text style={styles.radarLabel}>SAFETY RADAR</Text>
          </View>
          <Text style={styles.radiusLabel}>within 5 km</Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centeredRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.quietText}>Scanning area...</Text>
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.centeredRow}>
            <Ionicons
              name="checkmark-circle-outline"
              size={20}
              color="#10B981"
            />
            <Text style={styles.quietText}>All quiet in your area</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
            keyboardShouldPersistTaps="handled"
          >
            {alerts.map((alert) => (
              <IncidentPill
                key={alert.id}
                alert={alert}
                isSelected={selectedAlertId === alert.id}
                onPress={handlePillPress}
                colors={colors}
              />
            ))}
          </ScrollView>
        )}

        {/* Action / Detail row when an alert is selected */}
        {selectedAlert && !loading && (
          <View style={styles.selectedFooter}>
            <Text style={styles.trailHint}>
              <Ionicons name="footsteps-outline" size={11} color={colors.text.secondary} />
              {'  '}Movement trail shown on map
            </Text>

            {!selectedAlert.isOwn && onRespondPress && (
              <TouchableOpacity
                style={styles.respondButton}
                onPress={() => onRespondPress(selectedAlert)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View details and respond"
              >
                <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.respondButtonText}>View Details & Respond</Text>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }
);

IncidentDrawer.displayName = 'IncidentDrawer';

// ── Styles ────────────────────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    drawer: {
      backgroundColor: colors.white,
      borderRadius: 20,
      marginHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      ...Shadows.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    radarBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    radarDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.primary,
    },
    radarLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.8,
    },
    radiusLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    centeredRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    quietText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    pillRow: {
      gap: 10,
      paddingRight: 4,
    },
    trailHint: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    selectedFooter: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    respondButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    respondButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
  });

// ── Pill-level styles (parameterised) ─────────────────────────────────────────

const pillStyles = (
  colors: ThemeColors,
  accentColor: string,
  isSelected: boolean
) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isSelected ? accentColor : colors.background,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1.5,
      borderColor: isSelected ? accentColor : `${accentColor}30`,
      minWidth: 160,
      maxWidth: 220,
    },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : `${accentColor}18`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pillText: {
      flex: 1,
    },
    pillType: {
      fontSize: 13,
      fontWeight: '700',
      color: isSelected ? '#FFFFFF' : colors.text.primary,
      marginBottom: 2,
    },
    pillMeta: {
      fontSize: 11,
      color: isSelected ? 'rgba(255,255,255,0.8)' : colors.text.secondary,
    },
    pillTime: {
      fontSize: 10,
      fontWeight: '600',
      color: isSelected ? 'rgba(255,255,255,0.7)' : colors.text.secondary,
    },
  });
