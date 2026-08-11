import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../../src/context/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import { JourneyCard } from '../../src/components/JourneyCard';
import { JourneySetupModal } from '../../src/components/JourneySetupModal';
import { ActiveJourneyTracker } from '../../src/components/ActiveJourneyTracker';

export default function MapScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  
  // Journey state
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [activeJourney, setActiveJourney] = useState<{ destination: string; mode: string } | null>(null);

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
        {activeJourney ? (
          <ActiveJourneyTracker
            destination={activeJourney.destination}
            mode={activeJourney.mode}
            onEndJourney={() => setActiveJourney(null)}
          />
        ) : (
          <JourneyCard onStart={() => setShowJourneyModal(true)} />
        )}
      </View>

      {/* Journey Setup Modal */}
      <JourneySetupModal
        visible={showJourneyModal}
        onClose={() => setShowJourneyModal(false)}
        onStart={(destination, mode) => {
          setActiveJourney({ destination, mode });
          setShowJourneyModal(false);
        }}
      />
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
    left: 0,
    right: 0,
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
