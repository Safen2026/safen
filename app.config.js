export default ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          // This ensures we ONLY use the new key from your .env file, bypassing any old EAS Secrets
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
        }
      }
    }
  };
};
