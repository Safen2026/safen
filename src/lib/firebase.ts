import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

// React Native Firebase automatically initializes using the native
// google-services.json and GoogleService-Info.plist files injected
// by Expo during the native build process.
//
// If the native module isn't linked yet (e.g. running in Expo Go or
// before a rebuild), getAuth() will throw. We catch that here so the
// rest of the app doesn't crash on import.

let firebaseAuth: ReturnType<typeof getAuth> | null = null;
let firebaseApp: ReturnType<typeof getApp> | null = null;

try {
  firebaseApp = getApp();
  firebaseAuth = getAuth();
} catch (e) {
  console.warn(
    '[firebase.ts] Native Firebase module not available. ' +
    'Run `npx expo run:ios --device` to rebuild with Firebase linked. ' +
    'Error:', e
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