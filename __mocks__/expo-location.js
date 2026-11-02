/**
 * Minimal stub for expo-location so pure utility tests that import
 * formatAddress (which imports expo-location types) don't require
 * a native environment to run.
 */
module.exports = {
  LocationGeocodedAddress: {},
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(false),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  getLastKnownPositionAsync: jest.fn().mockResolvedValue(null),
  getCurrentPositionAsync: jest.fn().mockResolvedValue(null),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([]),
  Accuracy: {
    Balanced: 3,
    High: 4,
    Highest: 5,
    Low: 1,
    Lowest: 0,
    BestForNavigation: 6,
  },
};
