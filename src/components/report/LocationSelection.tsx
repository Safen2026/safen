import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';
import * as Location from 'expo-location';

interface LocationSelectionProps {
  location: Location.LocationObject | null;
  address: string;
  setAddress: (text: string) => void;
  locationDetails: string;
  setLocationDetails: (text: string) => void;
  isFullScreenMap: boolean;
  setIsFullScreenMap: (val: boolean) => void;
  mapRef: React.Ref<MapView>;
  handleRegionChangeComplete: (region: Region) => void;
  fetchCurrentLocation: () => void;
  geocodeAddress: (text: string) => void;
  onNext: () => void;
  colors: ThemeColors;
}

export const LocationSelection = React.memo(function LocationSelection({
  location,
  address,
  setAddress,
  locationDetails,
  setLocationDetails,
  isFullScreenMap,
  setIsFullScreenMap,
  mapRef,
  handleRegionChangeComplete,
  fetchCurrentLocation,
  geocodeAddress,
  onNext,
  colors
}: LocationSelectionProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <>
      <View style={[styles.step2Container, { paddingBottom: 0, paddingHorizontal: 0 }]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.titleLeft} accessibilityRole="header">Where is this happening?</Text>
        
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={16} color="#D92D20" style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={styles.warningText}>
              GPS can be inaccurate indoors. Please verify the pin and provide exact details below if needed.
            </Text>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.text.secondary} />
            <TextInput 
              style={styles.searchInput}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter address manually..."
              placeholderTextColor={colors.text.secondary}
              returnKeyType="search"
              onSubmitEditing={() => geocodeAddress(address)}
              accessibilityRole="search"
              accessibilityLabel="Search address"
            />
            {address.length > 0 && (
              <TouchableOpacity onPress={() => setAddress('')} accessibilityRole="button" accessibilityLabel="Clear address">
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.mapContainer}>
            {location ? (
              <MapView
                ref={mapRef}
                style={{ width: '100%', height: '100%' }}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                showsUserLocation={true}
                onRegionChangeComplete={handleRegionChangeComplete}
              />
            ) : (
              <View style={styles.mapMockBg}>
                 <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {/* Center Map Pin Overlay */}
            <View style={styles.mapPinContainer} pointerEvents="none">
              <View style={styles.mapPinRing}>
                <View style={styles.mapPinCenter} />
              </View>
            </View>

            {/* Use Current Location Button */}
            <TouchableOpacity 
              style={styles.currentLocationBtn} 
              activeOpacity={0.8}
              onPress={fetchCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel="Use current location"
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#00875A" />
              <Text style={styles.currentLocationText}>Use Current Location</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.expandBtn} 
              activeOpacity={0.8}
              onPress={() => setIsFullScreenMap(true)}
              accessibilityRole="button"
              accessibilityLabel="Expand map to full screen"
            >
              <Ionicons name="expand" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <Modal visible={isFullScreenMap} animationType="slide" onRequestClose={() => setIsFullScreenMap(false)}>
            <View style={styles.flex1}>
              <MapView
                style={styles.flex1}
                provider={PROVIDER_DEFAULT}
                initialRegion={location ? {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                } : undefined}
                showsUserLocation={true}
                onRegionChangeComplete={handleRegionChangeComplete}
              />
              <View style={styles.mapPinContainer} pointerEvents="none">
                <View style={styles.mapPinRing}>
                  <View style={styles.mapPinCenter} />
                </View>
              </View>
              <TouchableOpacity 
                style={styles.fullScreenCloseBtn} 
                activeOpacity={0.8}
                onPress={() => setIsFullScreenMap(false)}
                accessibilityRole="button"
                accessibilityLabel="Close full screen map"
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
              <View style={styles.fullScreenFooter}>
                <TouchableOpacity 
                  style={[styles.nextButton, styles.w100]}
                  activeOpacity={0.8}
                  onPress={() => setIsFullScreenMap(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm location"
                >
                  <Text style={styles.nextButtonText}>Confirm Location</Text>
                  <Ionicons name="checkmark" size={20} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={styles.mt20}>
            <Text style={styles.detailsLabel}>
              Exact Location Details (Optional)
            </Text>
            <TextInput
              style={styles.detailsInput}
              multiline
              placeholder="e.g., Floor 3, Room 402, or near the library entrance..."
              placeholderTextColor={colors.text.secondary}
              value={locationDetails}
              onChangeText={setLocationDetails}
              accessibilityLabel="Exact location details"
            />
          </View>
          
          <TouchableOpacity 
            style={[styles.nextButton, { marginTop: 32 }]}
            activeOpacity={0.8}
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Next step: Add Details"
          >
            <Text style={styles.nextButtonText}>Next: Add Details</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  step2Container: {
    flex: 1,
  },
  titleLeft: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
  },
  warningBox: {
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    backgroundColor: 'rgba(217, 45, 32, 0.1)', 
    padding: 12, 
    borderRadius: 8, 
    marginBottom: 16 
  },
  warningText: {
    flex: 1, 
    fontSize: 13, 
    color: '#D92D20', 
    lineHeight: 18 
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '500',
    marginHorizontal: 12,
  },
  mapContainer: {
    height: 350,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMockBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E6F4F1',
    opacity: 0.8,
    justifyContent: 'center', 
    alignItems: 'center'
  },
  mapPinContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#00875A',
    backgroundColor: 'rgba(0, 135, 90, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinCenter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00875A',
  },
  currentLocationBtn: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    gap: 8,
  },
  currentLocationText: {
    color: colors.text.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  expandBtn: {
    position: 'absolute', 
    top: 12, 
    right: 12, 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: 8, 
    borderRadius: 8, 
    elevation: 4, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 4 
  },
  fullScreenCloseBtn: {
    position: 'absolute', 
    top: 50, 
    left: 20, 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: 10, 
    borderRadius: 20, 
    elevation: 4, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 4 
  },
  fullScreenFooter: {
    position: 'absolute', 
    bottom: 40, 
    left: 20, 
    right: 20 
  },
  detailsLabel: {
    fontSize: 14, 
    fontWeight: '700', 
    color: colors.text.primary, 
    marginBottom: 8 
  },
  detailsInput: {
    backgroundColor: colors.white, 
    borderWidth: 1, 
    borderColor: colors.border, 
    borderRadius: 12, 
    padding: 12, 
    minHeight: 80, 
    textAlignVertical: 'top',
    color: colors.text.primary,
  },
  nextButton: {
    backgroundColor: '#00875A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  nextButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  flex1: { flex: 1 },
  w100: { width: '100%' },
  mt20: { marginTop: 20 },
});
