/** @type {import('jest').Config} */
const config = {
  // jest-expo handles all Expo/React Native module transforms and mocks
  preset: 'jest-expo',

  // TypeScript support via babel (jest-expo includes the transformer)
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],

  // Where to find tests
  testMatch: [
    '**/__tests__/**/*.(test|spec).[jt]s?(x)',
  ],

  // Module name mapping for path aliases and stubbing native modules
  moduleNameMapper: {
    // Stub expo-location so pure utils tests don't need a native env
    '^expo-location$': '<rootDir>/__mocks__/expo-location.js',
    // AsyncStorage requires a native bridge — use the official jest mock
    '@react-native-async-storage/async-storage': '@react-native-async-storage/async-storage/jest/async-storage-mock',
    // react-native-url-polyfill imports URL which is fine in Node, just stub the auto-import
    'react-native-url-polyfill/auto': '<rootDir>/__mocks__/react-native-url-polyfill.js',
  },

  // Coverage config
  collectCoverageFrom: [
    'src/utils/**/*.{ts,tsx}',
    'src/lib/reportQuality.ts',
    'src/lib/emergencySms.ts',
    'src/lib/events.ts',
    'src/lib/notifications.ts',
    'src/hooks/useHistory.ts',
    'src/hooks/useNotifications.ts',
    'src/hooks/useSafeCheckIn.ts',
    'src/hooks/useContacts.ts',
    '!src/**/*.d.ts',
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  coverageReporters: ['text', 'lcov', 'html'],

  // Show verbose test names in CI
  verbose: true,
};

module.exports = config;
