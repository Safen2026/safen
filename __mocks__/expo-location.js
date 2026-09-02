/**
 * Minimal stub for expo-location so pure utility tests that import
 * formatAddress (which imports expo-location types) don't require
 * a native environment to run.
 */
module.exports = {
  LocationGeocodedAddress: {},
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
    High: 4,
    Highest: 5,
    Low: 1,
    Lowest: 0,
    BestForNavigation: 6,
  },
};
