import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { PERMISSIONS_STORAGE_KEY } from '../../app/permissions';

/**
 * Determines whether the user should be sent through the onboarding/permissions screen.
 *
 * Rules:
 *   1. If the AsyncStorage flag has never been set -> always show /permissions.
 *   2. If the flag IS set but the OS has revoked Location OR Notifications
 *      (e.g. after a reinstall that restores backed-up storage on Samsung / Google
 *      devices) -> show /permissions so the user re-grants critical permissions.
 *   3. Otherwise -> proceed directly to the app.
 *
 * Camera and Microphone are secondary SOS-evidence permissions and can be
 * re-granted later via Settings or the ambient PermissionWarningBanner.
 */
export async function checkNeedsPermissionsOnboarding(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(PERMISSIONS_STORAGE_KEY);
    if (stored !== 'true') {
      // Never completed onboarding at all
      return true;
    }

    // Onboarding was previously completed. Now verify that the two critical
    // OS-level permissions are still granted (guards against Android Auto Backup skip).
    // These are non-blocking reads (~10-15 ms in parallel) — no OS popup appears.
    const [locResult, notifResult] = await Promise.allSettled([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);

    const locGranted = locResult.status === 'fulfilled' && locResult.value.granted;
    const notifGranted = notifResult.status === 'fulfilled' && notifResult.value.granted;

    // If either critical permission is missing, route back through onboarding
    return !locGranted || !notifGranted;
  } catch {
    // If anything fails (storage error, permissions API unavailable), be safe
    // and let the user proceed rather than soft-locking them.
    return false;
  }
}
