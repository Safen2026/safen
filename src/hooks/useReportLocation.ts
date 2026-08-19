import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { Region } from 'react-native-maps';
import MapView from 'react-native-maps';

export function useReportLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState('Fetching location...');
  const [locationDetails, setLocationDetails] = useState('');
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);
  const mapRef = useRef<MapView>(null);

  const fetchCurrentLocation = useCallback(async () => {
    try {
      setAddress('Locating you...');
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAddress('Location permission denied');
        return;
      }
      
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);
      
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);

      try {
        let geocode = await Location.reverseGeocodeAsync(loc.coords);
        if (geocode && geocode.length > 0) {
          const place = geocode[0];
          
          let primaryName = place.street;
          if (!primaryName && place.name && !place.name.includes('+')) {
            primaryName = place.name;
          }
          if (!primaryName) {
            primaryName = place.district || 'Unnamed Road';
          }

          const formattedAddress = `${place.streetNumber ? place.streetNumber + ' ' : ''}${primaryName}, ${place.city || place.subregion || place.region}`;
          setAddress(formattedAddress);
        } else {
          setAddress('Unnamed Location');
        }
      } catch {
        setAddress('Unnamed Location');
      }
    } catch {
      setAddress('Failed to find location');
    }
  }, []);

  const handleRegionChangeComplete = useCallback(async (region: Region) => {
    try {
      setLocation(prev => prev ? {
        ...prev,
        coords: {
          ...prev.coords,
          latitude: region.latitude,
          longitude: region.longitude
        }
      } : {
        coords: {
          latitude: region.latitude,
          longitude: region.longitude,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      
      setAddress('Fetching location...');
      let geocode = await Location.reverseGeocodeAsync({
        latitude: region.latitude,
        longitude: region.longitude
      });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        
        let primaryName = place.street;
        if (!primaryName && place.name && !place.name.includes('+')) {
          primaryName = place.name;
        }
        
        if (!primaryName) {
          primaryName = place.district || 'Unnamed Road';
        }

        const formattedAddress = `${place.streetNumber ? place.streetNumber + ' ' : ''}${primaryName}, ${place.city || place.subregion || place.region}`;
        setAddress(formattedAddress);
      } else {
        setAddress('Unnamed Location');
      }
    } catch {
      setAddress('Unnamed Location');
    }
  }, []);

  const geocodeAddress = useCallback(async (text: string) => {
    if (text.trim().length > 3) {
      try {
        const geocodeResult = await Location.geocodeAsync(text);
        if (geocodeResult && geocodeResult.length > 0) {
          const { latitude, longitude } = geocodeResult[0];
          setLocation(prev => prev ? {
            ...prev,
            coords: {
              ...prev.coords,
              latitude,
              longitude
            }
          } : {
            coords: {
              latitude,
              longitude,
              altitude: null,
              accuracy: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
          mapRef.current?.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }, 500);
        }
      } catch {
        // Geocoding failed, leave as is
      }
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setAddress('Fetching location...');
    setLocationDetails('');
  }, []);

  return {
    location,
    setLocation,
    address,
    setAddress,
    locationDetails,
    setLocationDetails,
    isFullScreenMap,
    setIsFullScreenMap,
    mapRef,
    fetchCurrentLocation,
    handleRegionChangeComplete,
    geocodeAddress,
    clearLocation,
  };
}
