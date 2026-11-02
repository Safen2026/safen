/**
 * BreadcrumbPolyline.tsx
 *
 * Draws the GPS breadcrumb trail for an active alert on the map.
 *
 * - Polyline: red, slightly translucent, 4px wide
 * - Head marker: a pulsing dot at the most-recent coordinate
 *   (pulse achieved via a simple CSS-style animated ring using React Native's
 *    Animated API — no external animation library required)
 *
 * Renders nothing when `breadcrumbs` is empty or has fewer than 2 points.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Polyline, Marker } from 'react-native-maps';
import type { Breadcrumb } from '../../hooks/useRadarAlerts';

// ── Animated pulsing head dot ─────────────────────────────────────────────────

const PulsingDot = React.memo(() => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 2,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.15,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.8,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.dotWrapper}>
      {/* Pulsing ring */}
      <Animated.View
        style={[
          styles.ring,
          { transform: [{ scale }], opacity },
        ]}
      />
      {/* Solid core */}
      <View style={styles.dotCore} />
    </View>
  );
});

PulsingDot.displayName = 'PulsingDot';

// ── Main export ───────────────────────────────────────────────────────────────

interface BreadcrumbPolylineProps {
  breadcrumbs: Breadcrumb[];
}

export const BreadcrumbPolyline = React.memo(
  ({ breadcrumbs }: BreadcrumbPolylineProps) => {
    if (breadcrumbs.length < 2) return null;

    const head = breadcrumbs[breadcrumbs.length - 1];

    const coordinates = breadcrumbs.map((b) => ({
      latitude: b.latitude,
      longitude: b.longitude,
    }));

    return (
      <>
        {/* Trail line */}
        <Polyline
          coordinates={coordinates}
          strokeColor="#E02B2B"
          strokeWidth={4}
          lineDashPattern={undefined} // Solid line
          lineJoin="round"
          lineCap="round"
        />

        {/* Pulsing head at the latest position */}
        <Marker
          coordinate={{ latitude: head.latitude, longitude: head.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <PulsingDot />
        </Marker>
      </>
    );
  }
);

BreadcrumbPolyline.displayName = 'BreadcrumbPolyline';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dotWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E02B2B',
  },
  dotCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E02B2B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#E02B2B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
});

