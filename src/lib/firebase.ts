import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

// React Native Firebase automatically initializes using the native google-services.json
// and GoogleService-Info.plist files injected by Expo during the native build process.

export const firebaseAuth = getAuth();

export const getCurrentUser = () => {
  const user = firebaseAuth.currentUser;
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
  const user = firebaseAuth.currentUser;
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

export default getApp();
