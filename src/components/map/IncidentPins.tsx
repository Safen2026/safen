/**
 * IncidentPins.tsx
 *
 * Renders coloured map markers for each RadarAlert.
 * Each pin uses a custom SVG-style View callout so we avoid
 * react-native-maps' built-in callout (which has known layout bugs on Android).
 *
 * Pin colours:
 *   🔴 sos     → #E02B2B
 *   🟣 medical → #DC2626
 *   🔵 police  → #2563EB
 *   🟠 fire    → #EA580C
 *
 * The currently selected pin is enlarged via a ring highlight.
 */

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { RadarAlert } from '../../hooks/useRadarAlerts';

// ── Pin colour + icon map ──────────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface PinConfig {
  color: string;
  icon: IoniconsName;
}

const PIN_CONFIG: Record<RadarAlert['type'], PinConfig> = {
  sos:     { color: '#E02B2B', icon: 'alert-circle' },
  medical: { color: '#DC2626', icon: 'medkit' },
  police:  { color: '#2563EB', icon: 'shield' },
  fire:    { color: '#EA580C', icon: 'flame' },
};

// ── Sub-component: single custom pin marker ───────────────────────────────────

interface PinMarkerProps {
  alert: RadarAlert;
  isSelected: boolean;
}

const PinMarker = React.memo(({ alert, isSelected }: PinMarkerProps) => {
  const cfg = PIN_CONFIG[alert.type] ?? PIN_CONFIG.sos;

  return (
    <View style={[styles.pinWrapper, isSelected && styles.pinWrapperSelected]}>
      {/* Outer ring — only shown when selected */}
      {isSelected && (
        <View style={[styles.outerRing, { borderColor: cfg.color }]} />
      )}

      {/* Pin body */}
      <View style={[styles.pin, { backgroundColor: cfg.color }]}>
        <Ionicons name={cfg.icon} size={14} color="#FFFFFF" />
      </View>

      {/* Downward triangle caret */}
      <View style={[styles.caret, { borderTopColor: cfg.color }]} />
    </View>
  );
});

PinMarker.displayName = 'PinMarker';

// ── Main export ───────────────────────────────────────────────────────────────

interface IncidentPinsProps {
  alerts: RadarAlert[];
  selectedAlertId: string | null;
  onPinPress: (alert: RadarAlert) => void;
}

export const IncidentPins = React.memo(
  ({ alerts, selectedAlertId, onPinPress }: IncidentPinsProps) => {
    const handlePress = useCallback(
      (alert: RadarAlert) => () => {
        onPinPress(alert);
      },
      [onPinPress]
    );

    return (
      <>
        {alerts.map((alert) => (
          <Marker
            key={alert.id}
            coordinate={{ latitude: alert.latitude, longitude: alert.longitude }}
            onPress={handlePress(alert)}
            // tracksViewChanges=false is critical for performance on Android —
            // it stops the map from re-rendering the custom view on every frame.
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
          >
            <PinMarker
              alert={alert}
              isSelected={selectedAlertId === alert.id}
            />
          </Marker>
        ))}
      </>
    );
  }
);

IncidentPins.displayName = 'IncidentPins';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pinWrapper: {
    alignItems: 'center',
    // Extra padding so the outer ring is never clipped
    padding: 6,
  },
  pinWrapperSelected: {
    // Slightly larger hit area when selected — helps user tap the caret region
  },
  outerRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 8, // Stop above caret
    borderRadius: 24,
    borderWidth: 2.5,
    opacity: 0.4,
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  caret: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderTopColor is set dynamically per type
    marginTop: -1,
  },
});
