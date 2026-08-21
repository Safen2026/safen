// React Native Firebase automatically initializes using the native
// google-services.json and GoogleService-Info.plist files injected
// by Expo during the native build process.
//
// IMPORTANT: We use require() instead of import here because
// @react-native-firebase throws during the import statement itself
// (not during getApp/getAuth calls) when the native TurboModule
// isn't linked yet. Static imports are hoisted and can't be caught.
// require() inside try/catch handles this correctly.

let firebaseApp: ReturnType<typeof import('@react-native-firebase/app').getApp> | null = null;
let firebaseAuth: ReturnType<typeof import('@react-native-firebase/auth').getAuth> | null = null;

try {
  const { getApp } = require('@react-native-firebase/app');
  const { getAuth } = require('@react-native-firebase/auth');
  firebaseApp = getApp();
  firebaseAuth = getAuth();
} catch (e) {
  console.warn(
    '[firebase.ts] Firebase native module not available. ' +
    'Run `npx expo run:ios --device` to rebuild with Firebase linked.',
  );
}

export { firebaseAuth };

export const getCurrentUser = () => {
  const user = firebaseAuth?.currentUser ?? null;
  if (!user) return { data: { user: null } };
  return {
    data: {
      user: {
        id: user.uid,
        phone: user.phoneNumber,
        user_metadata: { full_name: user.displayName },
      },
    },
  };
};

export const getCurrentSession = async () => {
  const user = firebaseAuth?.currentUser ?? null;
  if (!user) return { data: { session: null } };
  const token = await user.getIdToken();
  return {
    data: {
      session: {
        access_token: token,
        user: {
          id: user.uid,
          phone: user.phoneNumber,
          user_metadata: { full_name: user.displayName },
        },
      },
    },
  };
};

export default firebaseApp;