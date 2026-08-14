import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../../src/context/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import { JourneyCard } from '../../src/components/JourneyCard';
import { JourneySetupModal } from '../../src/components/JourneySetupModal';
import { ActiveJourneyTracker } from '../../src/components/ActiveJourneyTracker';
import { ShareTripModal } from '../../src/components/ShareTripModal';
import { ActiveTripShareCard } from '../../src/components/ActiveTripShareCard';
import { useJourneyTracking } from '../../src/hooks/useJourneyTracking';
import { useShareLiveTrip, TripShareContact } from '../../src/hooks/useShareLiveTrip';
import { tripEvents, TripSharePayload } from '../../src/lib/events';

export default function MapScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Journey Tracking state
  const [showJourneyModal, setShowJourneyModal] = useState(false);

  // Share Live Trip state
  const [shareTripContact, setShareTripContact] = useState<TripShareContact | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const mapRef = React.useRef<MapView>(null);

  // Hooks
  const {
    session: journeySession,
    elapsedStr,
    isActive: isJourneyActive,
    isStarting: isJourneyStarting,
    isEnding: isJourneyEnding,
    startJourney,
    endJourney,
    cancelJourney,
  } = useJourneyTracking();

  const {
    session: shareSession,
    remainingStr,
    isActive: isShareActive,
    isStarting: isShareStarting,
    isEnding: isShareEnding,
    startSharing,
    stopSharing,
    extendSharing,
  } = useShareLiveTrip();

  // ── Initial device location ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);
    })();
  }, []);

  // ── Listen for "Share Live Trip" event from contacts tab ───────────────────
  useEffect(() => {
    const unsub = tripEvents.onShareTrip((payload: TripSharePayload) => {
      setShareTripContact({
        id: payload.contactId,
        contactUserId: payload.contactUserId,
        name: payload.contactName,
      });
      setShowShareModal(true);
    });
    return unsub;
  }, []);

  // ── Jump to pin when navigated from alert notification ─────────────────────
  useEffect(() => {
    if (isMapReady && lat && lng && mapRef.current) {
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);
      if (!isNaN(targetLat) && !isNaN(targetLng)) {
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

  // ── Journey handlers ───────────────────────────────────────────────────────
  const handleJourneyStart = useCallback(async (destination: string, mode: string) => {
    setShowJourneyModal(false);
    await startJourney(destination, mode);
  }, [startJourney]);

  // ── Share trip handlers ────────────────────────────────────────────────────
  const handleShareStart = useCallback(async (durationMinutes: number) => {
    if (!shareTripContact) return;
    setShowShareModal(false);
    await startSharing(shareTripContact.contactUserId, shareTripContact.name, durationMinutes);
  }, [shareTripContact, startSharing]);

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
        {/* Alert pin — navigated from notification */}
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

        {/* Journey start pin */}
        {isJourneyActive && journeySession?.startLatitude && journeySession?.startLongitude && (
          <Marker
            coordinate={{
              latitude: journeySession.startLatitude,
              longitude: journeySession.startLongitude,
            }}
            title="Journey started here"
            pinColor="#10B981"
          />
        )}
      </MapView>

      {/* Floating bottom panel — priority: share > journey > idle */}
      <View style={styles.floatingPanel}>
        {isShareActive && shareSession ? (
          <ActiveTripShareCard
            contactName={shareSession.contactName}
            remainingStr={remainingStr}
            isEnding={isShareEnding}
            onStopSharing={() => stopSharing(false)}
            onExtend={extendSharing}
          />
        ) : isJourneyActive && journeySession ? (
          <ActiveJourneyTracker
            destination={journeySession.destination}
            mode={journeySession.mode}
            elapsedStr={elapsedStr}
            isEnding={isJourneyEnding}
            onEndJourney={endJourney}
            onCancelJourney={cancelJourney}
          />
        ) : (
          <JourneyCard
            onStart={() => setShowJourneyModal(true)}
            isLoading={isJourneyStarting || isShareStarting}
          />
        )}
      </View>

      {/* Journey Setup Modal */}
      <JourneySetupModal
        visible={showJourneyModal}
        onClose={() => setShowJourneyModal(false)}
        onStart={handleJourneyStart}
      />

      {/* Share Live Trip Modal */}
      <ShareTripModal
        visible={showShareModal}
        contact={shareTripContact}
        isStarting={isShareStarting}
        onClose={() => setShowShareModal(false)}
        onStart={handleShareStart}
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
  floatingPanel: {
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
  },
});
