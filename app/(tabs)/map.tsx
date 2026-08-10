import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../../src/context/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import { JourneyCard } from '../../src/components/JourneyCard';

export default function MapScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  
  const mapRef = React.useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      setLocation(loc);
    })();
  }, []);

  useEffect(() => {
    if (isMapReady && lat && lng && mapRef.current) {
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);
      if (!isNaN(targetLat) && !isNaN(targetLng)) {
        // Add a slight delay to ensure smooth transition after map is ready
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude: targetLat,
            longitude: targetLng,
            latitudeDelta: 0.001,
            longitudeDelta: 0.001,
          }, 1500);
        }, 500);
      }
    }
  }, [isMapReady, lat, lng]);

  if (errorMsg) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Locating you...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView 
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: (lat && !isNaN(parseFloat(lat))) ? parseFloat(lat) : location.coords.latitude,
          longitude: (lng && !isNaN(parseFloat(lng))) ? parseFloat(lng) : location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={true}
        showsMyLocationButton={true}
        onMapReady={() => setIsMapReady(true)}
      >
        {lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng)) && (
          <Marker
            coordinate={{ latitude: parseFloat(lat), longitude: parseFloat(lng) }}
            title="Emergency Location"
            description="Tap here to get directions"
            pinColor={colors.primary}
            onCalloutPress={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
              Linking.openURL(url);
            }}
          />
        )}
        <Marker 
          coordinate={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }}
          title="You are here"
          description="Your current location"
        />
      </MapView>

      {/* Floating Journey Tracking Card */}
      <View style={styles.floatingJourneyWrapper}>
        <View style={[styles.floatingJourneyCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
          <JourneyCard onStart={() => {}} />
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  floatingJourneyWrapper: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  floatingJourneyCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.secondary,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  }
});
