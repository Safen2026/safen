import * as Location from 'expo-location';

/**
 * Formats an Expo LocationGeocodedAddress into a human-readable, user-friendly string.
 * It filters out unwanted plus codes (e.g. 6FR+9G) and handles missing fields gracefully.
 */
export function formatAddress(place: Location.LocationGeocodedAddress): string {
  let primaryName = place.street;
  if (!primaryName && place.name && !place.name.includes('+')) {
    primaryName = place.name;
  }
  if (!primaryName) {
    primaryName = place.district || 'Unnamed Location';
  }

  const parts = [];
  if (place.streetNumber) {
    parts.push(`${place.streetNumber} ${primaryName}`);
  } else {
    parts.push(primaryName);
  }

  const secondary = place.city || place.subregion || place.region;
  if (secondary) {
    parts.push(secondary);
  }

  return parts.filter(Boolean).join(', ');
}

/**
 * Calculates distance in meters between two lat/lng pairs using the Haversine formula.
 */
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
