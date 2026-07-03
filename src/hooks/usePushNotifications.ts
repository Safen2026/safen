import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// Foreground behavior: show a banner + play a sound even while the app
// is open. Without this handler, Expo suppresses notifications whenever
// the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Registers this device for push and saves the Expo push token onto the
// user's profile row so the send-push Edge Function can target it.
// Requires a physical device + a dev build (won't work in Expo Go on
// SDK 53+, and simulators/emulators can't receive push at all).
export function usePushNotifications(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications(userId);
  }, [userId]);
}

async function registerForPushNotifications(userId: string) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device — skipping registration.');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Push notification permission was not granted.');
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('No EAS projectId in app.json — cannot fetch an Expo push token.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) console.warn('Failed to save push token:', error.message);
  } catch (err) {
    console.warn('registerForPushNotifications error:', err);
  }
}
