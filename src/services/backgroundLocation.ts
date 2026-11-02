import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export const SAFEN_BACKGROUND_LOCATION_TASK = 'safen-background-location-task';
const ACTIVE_ALERT_ID_STORAGE_KEY = '@safen_active_alert_id';

interface LocationTaskData {
  locations?: Location.LocationObject[];
}

/**
 * Global background task registration.
 * Must be executed in the global bundle scope on app boot.
 */
TaskManager.defineTask(SAFEN_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[BackgroundLocationTask] Task error:', error.message);
    return;
  }

  const taskData = data as LocationTaskData | undefined;
  const locations = taskData?.locations;
  if (!locations || locations.length === 0) return;

  const latestLocation = locations[locations.length - 1];
  const { latitude, longitude } = latestLocation.coords;

  try {
    const alertId = await AsyncStorage.getItem(ACTIVE_ALERT_ID_STORAGE_KEY);
    if (!alertId) {
      // No active emergency in progress — clear storage and stop the task.
      console.log('[BackgroundLocationTask] No active alert in storage. Stopping updates.');
      await AsyncStorage.removeItem(ACTIVE_ALERT_ID_STORAGE_KEY).catch((err) => {
        console.warn('[BackgroundLocationTask] Failed to remove alert ID from storage:', err);
      });
      const isRegistered = await TaskManager.isTaskRegisteredAsync(SAFEN_BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK);
      }
      return;
    }

    // 1. Update the alert's primary current position.
    // Using .select('id') so we can check whether the row was matched.
    // If count === 0 the alert was cancelled/resolved — stop tracking immediately.
    const { data: updatedRows, error: alertUpdateErr } = await supabase
      .from('alerts')
      .update({ latitude, longitude })
      .eq('id', alertId)
      .eq('status', 'active')
      .select('id');

    if (alertUpdateErr) {
      console.warn('[BackgroundLocationTask] Failed to update alert location:', alertUpdateErr.message);
    }

    // If the alert is no longer active (update matched 0 rows), self-stop.
    if (!updatedRows || updatedRows.length === 0) {
      console.log('[BackgroundLocationTask] Alert no longer active. Stopping task.');
      await AsyncStorage.removeItem(ACTIVE_ALERT_ID_STORAGE_KEY).catch((err) => {
        console.warn('[BackgroundLocationTask] Failed to remove alert ID from storage:', err);
      });
      const isRegistered = await TaskManager.isTaskRegisteredAsync(SAFEN_BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK);
      }
      return;
    }

    // 2. Append to breadcrumb trail in public.locations table
    const { error: breadcrumbErr } = await supabase
      .from('locations')
      .insert({
        alert_id: alertId,
        latitude,
        longitude,
        recorded_at: new Date(latestLocation.timestamp).toISOString(),
      });

    if (breadcrumbErr) {
      console.warn('[BackgroundLocationTask] Failed to log breadcrumb:', breadcrumbErr.message);
    }

    // 3. Telemetry gathering (non-blocking)
    try {
      const [batteryLevel, networkState] = await Promise.all([
        Battery.getBatteryLevelAsync().catch(() => null),
        Network.getNetworkStateAsync().catch(() => null),
      ]);

      if (__DEV__) {
        console.log(`[BackgroundLocationTask] Location updated | Battery: ${batteryLevel !== null ? `${Math.round(batteryLevel * 100)}%` : 'n/a'} | Type: ${networkState?.type ?? 'unknown'}`);
      }
    } catch {
      // Telemetry optional, swallow safely
    }
  } catch (err) {
    console.warn('[BackgroundLocationTask] Execution exception:', err);
  }
});

/**
 * Start background location tracking during an active SOS emergency.
 */
export async function startBackgroundLocationTracking(alertId: string): Promise<boolean> {
  try {
    // 1. Request foreground permissions first (prerequisite on iOS and Android)
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.warn('[BackgroundLocation] Foreground location permission not granted.');
      return false;
    }

    // 2. Check if we have background permission granted
    const bgPerm = await Location.getBackgroundPermissionsAsync().catch(() => null);
    const existingBackgroundStatus = bgPerm?.status;

    if (existingBackgroundStatus !== 'granted') {
      console.log('[BackgroundLocation] Background location permission not granted. Foreground tracking will handle updates.');
      await AsyncStorage.setItem(ACTIVE_ALERT_ID_STORAGE_KEY, alertId);
      return true;
    }

    // 3. Save the active alert ID to AsyncStorage so the background task knows which alert to update
    await AsyncStorage.setItem(ACTIVE_ALERT_ID_STORAGE_KEY, alertId);

    // 4. Check if already running
    const isStarted = await Location.hasStartedLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK).catch((err) => {
      console.warn('[BackgroundLocation] hasStartedLocationUpdatesAsync error:', err);
      return false;
    });
    if (isStarted) {
      console.log('[BackgroundLocation] Task already running for alert:', alertId);
      return true;
    }

    // 5. Start background tracking
    await Location.startLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000, // Update every 15 seconds
      distanceInterval: 10, // Or every 10 meters moved
      deferredUpdatesInterval: 15000,
      showsBackgroundLocationIndicator: true, // Blue status bar / Dynamic Island indicator on iOS
      foregroundService: {
        notificationTitle: 'SAFEN Emergency Tracking Active',
        notificationBody: 'Sharing your live location with emergency contacts.',
        notificationColor: '#E02B2B',
      },
      pausesUpdatesAutomatically: false,
    });

    console.log('[BackgroundLocation] Started background tracking for alert:', alertId);
    return true;
  } catch (err) {
    console.error('[BackgroundLocation] Failed to start background tracking:', err);
    return false;
  }
}

/**
 * Stop background location tracking when an emergency is cancelled or resolved.
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_ALERT_ID_STORAGE_KEY).catch((err) => {
      console.warn('[BackgroundLocation] Failed to remove alert ID on stop:', err);
    });

    const isRegistered = await TaskManager.isTaskRegisteredAsync(SAFEN_BACKGROUND_LOCATION_TASK);
    if (!isRegistered) return;

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK).catch((err) => {
      console.warn('[BackgroundLocation] hasStartedLocationUpdatesAsync check error on stop:', err);
      return false;
    });
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK);
      console.log('[BackgroundLocation] Stopped background location tracking.');
    }
  } catch (err) {
    console.error('[BackgroundLocation] Error stopping background location tracking:', err);
  }
}

/**
 * Check if background location tracking is actively running.
 */
export async function isBackgroundLocationTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(SAFEN_BACKGROUND_LOCATION_TASK);
  } catch (err) {
    console.warn('[BackgroundLocation] isBackgroundLocationTrackingActive check error:', err);
    return false;
  }
}
