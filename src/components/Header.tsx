import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Platform, StatusBar as RNStatusBar } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../constants/Theme';

export const Header = () => {
  const [locationName, setLocationName] = useState<string>('Locating...');

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationName('Permission denied');
        return;
      }

      try {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High, // Use High instead of Balanced to avoid cell-tower hopping
            timeInterval: 60000, // Check at most every 60 seconds
            distanceInterval: 500, // Only update if device moves at least 500 meters
          },
          async (location) => {
            try {
              let geocode = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
              });
              
              if (geocode && geocode.length > 0) {
                const place = geocode[0];
                const city = place.city || place.subregion || place.district || place.name || 'Unknown Area';
                const state = place.region || '';
                setLocationName(state ? `${city}, ${state}` : city);
              } else {
                setLocationName('Unknown Location');
              }
            } catch (error) {
              console.log('Reverse geocoding error:', error);
            }
          }
        );
      } catch (error) {
        setLocationName('Location Error');
      }
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <MaterialIcons name="location-on" size={24} color={Colors.status.safeText} />
        <View style={styles.locationTextContainer}>
          <Text style={styles.locationLabel}>Current Location</Text>
          <Text style={styles.locationValue} numberOfLines={1}>{locationName}</Text>
        </View>
      </View>
      <View style={styles.rightContent}>
        <Text style={styles.greetingText}>Hi, David</Text>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={20} color={Colors.text.secondary} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 10 : 40 : 50,
    paddingBottom: 15,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTextContainer: {
    marginLeft: 8,
  },
  locationLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginRight: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
