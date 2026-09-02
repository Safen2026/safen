import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/Theme';
import { useLocalSearchParams } from 'expo-router';
import { ShareTripModal } from '../../src/components/ShareTripModal';
import { ActiveTripShareCard } from '../../src/components/ActiveTripShareCard';
import { useShareLiveTrip, TripShareContact } from '../../src/hooks/useShareLiveTrip';
import { tripEvents, TripSharePayload } from '../../src/lib/events';
import { PinDetailsModal, PinData } from '../../src/components/PinDetailsModal';

export default function MapScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);


  // Share Live Trip state
  const [shareTripContact, setShareTripContact] = useState<TripShareContact | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Pin Details state
  const [selectedPin, setSelectedPin] = useState<PinData | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const handlePinClose = useCallback(() => setShowPinModal(false), []);

  const { lat, lng, senderName, alertType, alertTitle } = useLocalSearchParams<{ 
    lat?: string; 
    lng?: string; 
    senderName?: string;
    alertType?: string;
    alertTitle?: string;
  }>();
  const mapRef = React.useRef<MapView>(null);

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
        avatarUrl: payload.avatarUrl,
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



  // ── Share trip handlers ────────────────────────────────────────────────────
  const handleShareClose = useCallback(() => setShowShareModal(false), []);
  const handleShareStart = useCallback(async (durationMinutes: number) => {
    if (!shareTripContact) return;
    setShowShareModal(false);
    await startSharing(shareTripContact.contactUserId, shareTripContact.name, durationMinutes);
  }, [shareTripContact, startSharing]);
  
  const handleStopSharing = useCallback(() => stopSharing(false), [stopSharing]);

  const handleMapReady = useCallback(() => setIsMapReady(true), []);

  // Parse pin coordinates once — stable unless search params change
  const parsedLat = React.useMemo(() => (lat ? parseFloat(lat) : NaN), [lat]);
  const parsedLng = React.useMemo(() => (lng ? parseFloat(lng) : NaN), [lng]);
  const hasPinCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  const handleMarkerPress = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const decodedSender = senderName ? decodeURIComponent(senderName) : null;
    const decodedTitle  = alertTitle  ? decodeURIComponent(alertTitle)  : null;

    let pinTitle    = decodedSender ? `${decodedSender}'s Location` : 'Location';
    let pinSubtitle = decodedTitle ?? 'Alert';

    if (alertType === 'sos') {
      pinTitle    = decodedSender ? `${decodedSender}'s Emergency` : 'Emergency Location';
      pinSubtitle = 'Active SOS Alert';
    } else if (alertType === 'medical') {
      pinTitle    = decodedSender ? `${decodedSender}'s Emergency` : 'Medical Emergency';
      pinSubtitle = 'Active Medical Alert';
    } else if (alertType === 'fire') {
      pinTitle    = decodedSender ? `${decodedSender}'s Alert` : 'Fire Alert';
      pinSubtitle = 'Active Fire Alert';
    } else if (alertType === 'police') {
      pinTitle    = decodedSender ? `${decodedSender}'s Alert` : 'Security Alert';
      pinSubtitle = 'Active Police/Security Alert';
    } else if (alertType === 'report') {
      pinTitle    = decodedTitle ?? (decodedSender ? `${decodedSender}'s Live Location` : 'Shared Live Location');
      pinSubtitle = 'Live Location (Updates only when their app is open)';
    } else if (alertType === 'check_in_missed') {
      pinTitle    = decodedSender ? `${decodedSender} Missed Check-In` : 'Missed Check-In';
      pinSubtitle = 'Safety Watchdog Alert';
    }

    setSelectedPin({ latitude: parsedLat, longitude: parsedLng, title: pinTitle, subtitle: pinSubtitle });
    setShowPinModal(true);
  }, [senderName, alertTitle, alertType, parsedLat, parsedLng]);

  const initialRegion = React.useMemo(() => {
    if (!location) return undefined;
    return {
      latitude:  (hasPinCoords ? parsedLat : location.coords.latitude),
      longitude: (hasPinCoords ? parsedLng : location.coords.longitude),
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [location, hasPinCoords, parsedLat, parsedLng]);

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
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        toolbarEnabled={false}
        onMapReady={handleMapReady}
        mapPadding={{ top: 0, right: 0, bottom: 180, left: 0 }}
      >
        {/* Alert pin — navigated from notification */}
        {hasPinCoords && (
          <Marker
            coordinate={{ latitude: parsedLat, longitude: parsedLng }}
            pinColor={colors.primary}
            onPress={handleMarkerPress}
          />
        )}



      </MapView>

      {/* Floating bottom panel */}
      <View style={styles.floatingPanel}>
        {isShareActive && shareSession && (
          <ActiveTripShareCard
            contactName={shareSession.contactName}
            remainingStr={remainingStr}
            isEnding={isShareEnding}
            onStopSharing={handleStopSharing}
            onExtend={extendSharing}
          />
        )}
      </View>

      {/* Modals */}
      <ShareTripModal
        visible={showShareModal}
        contact={shareTripContact}
        isStarting={isShareStarting}
        onClose={handleShareClose}
        onStart={handleShareStart}
      />

      <PinDetailsModal
        visible={showPinModal}
        pin={selectedPin}
        onClose={handlePinClose}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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
