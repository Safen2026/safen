import { customAlert } from '../utils/customAlert';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing, Share, Linking, Platform, AppState, AppStateStatus
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';

import { formatAddress, getDistanceMeters } from '../utils/location';

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
const PulseDot = React.memo(({ color }: { color: string }) => {
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
      <Animated.View style={[dotStyles.ring, { borderColor: color, transform: [{ scale }], opacity }]} />
      <View style={[dotStyles.dot, { backgroundColor: color }]} />
    </View>
  );
});

const dotStyles = StyleSheet.create({
  wrap: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  ring: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  dot:  { width: 12, height: 12, borderRadius: 6 },
});

// Main card
export const LocationCard = React.memo(() => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [loc, setLoc]                 = useState<LocationState>(EMPTY);
  const [loading, setLoading]         = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Prevent geocode calls running after unmount
  const isMounted = useRef(true);
  // Remember last geocoded position to prevent reverse geocoding spam when standing still
  const lastGeocodedCoords = useRef<{ lat: number; lng: number } | null>(null);
  const isGeocoding = useRef(false);
  // Kept in sync with loc.address so the watcher callback can read it
  // without needing loc.address as an effect dependency (which would
  // restart the native watcher on every location update).
  const currentAddressRef = useRef<string>(EMPTY.address);

  const geocodePosition = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (places && places.length > 0) {
        return formatAddress(places[0]);
      }
    } catch (e) {
      console.warn('[LocationCard] reverseGeocodeAsync failed:', e);
    }
    return 'Current Location';
  }, []);

  const fetchLocation = useCallback(async (forceFresh = false) => {
    try {
      setLoading(true);

      const { status } = await Location.getForegroundPermissionsAsync();
      if (!isMounted.current) return;
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        setLoading(false);
        return;
      }

      // If forceFresh is true, bypass cached position.
      // Otherwise, only use cache if it was taken within the last 20 seconds.
      let pos: Location.LocationObject | null = null;
      if (!forceFresh) {
        pos = await Location.getLastKnownPositionAsync({ maxAge: 20000 }).catch(() => null);
      }

      if (!pos) {
        pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      }

      if (!pos || !isMounted.current) {
        setLoading(false);
        return;
      }

      const { latitude, longitude, accuracy } = pos.coords;
      const address = await geocodePosition(latitude, longitude);
      if (!isMounted.current) return;

      lastGeocodedCoords.current = { lat: latitude, lng: longitude };
      currentAddressRef.current = address;
      setLoc({
        address,
        accuracy,
        latitude,
        longitude,
      });
    } catch (err) {
      console.warn('[LocationCard] fetchLocation error:', err);
      if (isMounted.current) {
        setLoc((prev) => ({ ...prev, address: prev.address !== 'Locating...' ? prev.address : 'Unable to get location' }));
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [geocodePosition]);

  // 1. Initial fetch & AppState resume listener
  useEffect(() => {
    isMounted.current = true;
    fetchLocation(false);

    // Refresh position whenever the user resumes the app from the background
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMounted.current) {
        fetchLocation(true);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.remove();
    };
  }, [fetchLocation]);

  // 2. Active Movement Watcher (triggers as user moves from place to place)
  useEffect(() => {
    let watcherSub: { remove: () => void } | null = null;
    let isActive = true;

    async function startWatching() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || !isActive) return;

        watcherSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000, // Update every 10 seconds if moving
            distanceInterval: 25, // Only notify if moved at least 25 meters
          },
          async (newPos) => {
            if (!isActive || !newPos?.coords) return;
            const { latitude, longitude, accuracy } = newPos.coords;

            // Check how far we moved from last geocoded place
            const last = lastGeocodedCoords.current;
            const movedDist = last ? getDistanceMeters(last.lat, last.lng, latitude, longitude) : 999;

            // Read the current address from ref — no need to close over loc.address
            let newAddress = currentAddressRef.current;
            if (movedDist >= 40 && !isGeocoding.current) {
              isGeocoding.current = true;
              newAddress = await geocodePosition(latitude, longitude);
              currentAddressRef.current = newAddress;
              lastGeocodedCoords.current = { lat: latitude, lng: longitude };
              isGeocoding.current = false;
            }

            if (isActive) {
              setLoc({
                address: newAddress,
                accuracy,
                latitude,
                longitude,
              });
            }
          }
        );
      } catch (err) {
        console.warn('[LocationCard] watchPositionAsync failed:', err);
      }
    }

    startWatching();

    return () => {
      isActive = false;
      if (watcherSub) watcherSub.remove();
    };
  // currentAddressRef is a stable ref — safe to exclude from deps.
  // geocodePosition is memoized with useCallback([]), so it never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodePosition]);


  const handleShare = useCallback(async () => {
    if (!loc.latitude || !loc.longitude) {
      customAlert('Location unavailable', 'Wait for location to load before sharing.');
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
    <View style={styles.card}>
      <View style={styles.left}>
        <TouchableOpacity
          style={[styles.pinCircle, { backgroundColor: '#EF444420' }]}
          onPress={handleOpenMaps}
          disabled={loading || !loc.latitude}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open location in Maps"
        >
          <Ionicons name="location" size={18} color="#EF4444" />
        </TouchableOpacity>
        <View style={styles.textCol}>
          <Text style={styles.title}>Your Location</Text>
          <TouchableOpacity
            onPress={handleOpenMaps}
            disabled={loading || !loc.latitude}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open location in Maps"
          >
            <Text style={styles.address} numberOfLines={2}>
              {loading ? 'Locating...' : loc.address}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <PulseDot color={dotColor} />

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
    </View>
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