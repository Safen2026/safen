import { FirebaseApp, initializeApp, getApps, getApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

// Only initialize Firebase if a valid API key is present.
// The app uses Supabase for auth — Firebase is optional.
if (apiKey && apiKey.length > 10) {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } else {
      app = getApp();
      auth = getAuth(app);
    }
  } catch (e) {
    console.warn('Firebase initialization skipped:', e);
  }
}

export const firebaseAuth = auth;

export const getCurrentUser = () => {
  const user = firebaseAuth?.currentUser;
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
  const user = firebaseAuth?.currentUser;
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

export default app;
