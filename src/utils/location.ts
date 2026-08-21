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
