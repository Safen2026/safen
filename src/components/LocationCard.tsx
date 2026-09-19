import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing, Share, Alert, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';

type LocationState = {
  address: string;
  accuracy: number | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY: LocationState = { address: 'Locating...', accuracy: null, latitude: null, longitude: null };

const accuracyLabel = (acc: number | null): { label: string; color: string } => {
  if (acc === null) return { label: 'Loading', color: '#6B7280' };
  if (acc <= 10)    return { label: `High (${Math.round(acc)}m)`, color: '#22C55E' };
  if (acc <= 50)    return { label: `Medium (${Math.round(acc)}m)`, color: '#F59E0B' };
  return               { label: `Low (${Math.round(acc)}m)`, color: '#EF4444' };
};

// Pulsing blue dot
const PulseDot = ({ color }: { color: string }) => {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 600,  easing: Easing.in(Easing.ease),  useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 600,  useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={dotStyles.wrap}>
      {/* Outer pulse ring */}
      <Animated.View style={[dotStyles.ring, { borderColor: color, transform: [{ scale }], opacity }]} />
      {/* Inner solid dot */}
      <View style={[dotStyles.dot, { backgroundColor: color }]} />
    </View>
  );
};

const dotStyles = StyleSheet.create({
  wrap: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  ring: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  dot:  { width: 12, height: 12, borderRadius: 6 },
});

// Main card
export const LocationCard = React.memo(() => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [loc, setLoc]         = useState<LocationState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') { setLoading(false); return; }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude, accuracy } = pos.coords;

      // Reverse geocode
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const parts = [
        place?.streetNumber,
        place?.street,
        place?.district || place?.subregion,
        place?.city,
        place?.region,
      ].filter(Boolean);

      setLoc({
        address:   parts.length ? parts.join(', ') : 'Unknown location',
        accuracy:  accuracy,
        latitude,
        longitude,
      });
    } catch {
      setLoc({ ...EMPTY, address: 'Unable to get location' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleShare = useCallback(async () => {
    if (!loc.latitude || !loc.longitude) {
      Alert.alert('Location unavailable', 'Wait for location to load before sharing.');
      return;
    }
    const mapsUrl = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
    await Share.share({
      message: `My current location: ${loc.address}\n${mapsUrl}`,
      title:   'My Location — Safen',
    });
  }, [loc]);

  const handleOpenMaps = useCallback(async () => {
    if (!loc.latitude || !loc.longitude) return;
    const coords = `${loc.latitude},${loc.longitude}`;
    const label  = encodeURIComponent(loc.address);
    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?q=${label}&ll=${coords}`
      : `geo:${coords}?q=${coords}(${label})`;
    const fallback = `https://maps.google.com/?q=${coords}`;
    const canOpen = await Linking.canOpenURL(url);
    await Linking.openURL(canOpen ? url : fallback);
  }, [loc]);

  const { label: accLabel, color: accColor } = accuracyLabel(loc.accuracy);
  const dotColor = hasPermission ? '#3B82F6' : '#9CA3AF';

  return (
    <TouchableOpacity style={styles.card} onPress={handleOpenMaps} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open location in Maps">
      {/* Left: icon + text */}
      <View style={styles.left}>
        <View style={[styles.pinCircle, { backgroundColor: '#EF444420' }]}>
          <Ionicons name="location" size={18} color="#EF4444" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>Your Location</Text>
          <Text style={styles.address} numberOfLines={2}>
            {loading ? 'Locating...' : loc.address}
          </Text>
        </View>
      </View>

      {/* Centre: pulse dot */}
      <PulseDot color={dotColor} />

      {/* Right: accuracy + share */}
      <View style={styles.right}>
        <Text style={styles.accTitle}>Location Accuracy</Text>
        <Text style={[styles.accValue, { color: accColor }]}>{loading ? '—' : accLabel}</Text>
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: colors.white, borderColor: colors.border }]}
          onPress={handleShare}
          disabled={loading || !loc.latitude}
          activeOpacity={0.7}
        >
          <Ionicons name="paper-plane-outline" size={13} color={colors.text.primary} />
          <Text style={[styles.shareText, { color: colors.text.primary }]}>Share Location</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

LocationCard.displayName = 'LocationCard';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  pinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 3,
  },
  address: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  accTitle: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  accValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  shareText: {
    fontSize: 11,
    fontWeight: '600',
  },
});