import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  isBackgroundLocationTrackingActive,
  SAFEN_BACKGROUND_LOCATION_TASK,
} from '../../src/services/backgroundLocation';

// Mock Supabase
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      eq: jest.fn().mockReturnThis(),
    })),
  },
}));

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

describe('backgroundLocation service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const enableBtn = buttons?.find((b: any) => b.text === 'Enable for Emergencies');
      if (enableBtn?.onPress) {
        enableBtn.onPress();
      }
    });
  });

  describe('startBackgroundLocationTracking', () => {
    it('returns false if foreground location permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

      const success = await startBackgroundLocationTracking('alert-123');
      expect(success).toBe(false);
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('stores alertId and starts background tracking when permission is granted', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(false);
      (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(undefined);

      const success = await startBackgroundLocationTracking('alert-456');
      expect(success).toBe(true);

      // Verify alert ID stored in AsyncStorage
      const storedId = await AsyncStorage.getItem('@safen_active_alert_id');
      expect(storedId).toBe('alert-456');

      // Verify started with foreground service config for Android & indicator for iOS
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        SAFEN_BACKGROUND_LOCATION_TASK,
        expect.objectContaining({
          showsBackgroundLocationIndicator: true,
          foregroundService: expect.objectContaining({
            notificationTitle: 'SAFEN Emergency Tracking Active',
          }),
        })
      );
    });

    it('returns true without re-calling startLocationUpdatesAsync if already started', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);

      const success = await startBackgroundLocationTracking('alert-789');
      expect(success).toBe(true);
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('SAD PATH: handles missing background permission gracefully without blocking or showing Alert during SOS', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

      const success = await startBackgroundLocationTracking('alert-declined');
      // Should still proceed with alert ID in storage for foreground updates
      expect(success).toBe(true);
      const storedId = await AsyncStorage.getItem('@safen_active_alert_id');
      expect(storedId).toBe('alert-declined');
      // Background location task should NOT be started
      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('SAD PATH: returns false when startLocationUpdatesAsync throws an OS error', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(false);
      (Location.startLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(new Error('Native location manager unavailable'));

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const success = await startBackgroundLocationTracking('alert-crash');
      expect(success).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        '[BackgroundLocation] Failed to start background tracking:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });

  describe('stopBackgroundLocationTracking', () => {
    it('clears storage and stops location updates if task was running', async () => {
      await AsyncStorage.setItem('@safen_active_alert_id', 'alert-456');
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(undefined);

      await stopBackgroundLocationTracking();

      const storedId = await AsyncStorage.getItem('@safen_active_alert_id');
      expect(storedId).toBeNull();
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(SAFEN_BACKGROUND_LOCATION_TASK);
    });

    it('does not error if task is not registered', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(false);

      await expect(stopBackgroundLocationTracking()).resolves.not.toThrow();
      expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('SAD PATH: handles stopLocationUpdatesAsync error gracefully without throwing', async () => {
      await AsyncStorage.setItem('@safen_active_alert_id', 'alert-err');
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.stopLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(new Error('OS task stop failure'));

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(stopBackgroundLocationTracking()).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        '[BackgroundLocation] Error stopping background location tracking:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });

  describe('isBackgroundLocationTrackingActive', () => {
    it('returns true when location updates are running', async () => {
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);
      const active = await isBackgroundLocationTrackingActive();
      expect(active).toBe(true);
    });

    it('returns false when location updates are not running', async () => {
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(false);
      const active = await isBackgroundLocationTrackingActive();
      expect(active).toBe(false);
    });

    it('SAD PATH: returns false when hasStartedLocationUpdatesAsync throws', async () => {
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockRejectedValueOnce(new Error('Bridge detached'));
      const active = await isBackgroundLocationTrackingActive();
      expect(active).toBe(false);
    });
  });

  describe('TaskManager background task handler execution', () => {
    const taskHandler = (TaskManager.defineTask as jest.Mock).mock.calls.find(
      ([name]) => name === SAFEN_BACKGROUND_LOCATION_TASK
    )?.[1];

    it('is registered globally via TaskManager.defineTask', () => {
      expect(typeof taskHandler).toBe('function');
    });

    it('SAD PATH: handles OS background error safely without throwing', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(taskHandler({ error: { message: 'GPS satellite loss' } })).resolves.not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        '[BackgroundLocationTask] Task error:',
        'GPS satellite loss'
      );
      warnSpy.mockRestore();
    });

    it('SAD PATH: returns immediately if locations array is empty or undefined', async () => {
      await expect(taskHandler({ data: {} })).resolves.not.toThrow();
      await expect(taskHandler({ data: { locations: [] } })).resolves.not.toThrow();
    });

    it('SAD PATH: self-heals and cleans up if task fires but no alertId is in AsyncStorage', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(true);
      (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(undefined);

      await taskHandler({
        data: {
          locations: [
            {
              coords: { latitude: 6.5, longitude: 3.3 },
              timestamp: Date.now(),
            },
          ],
        },
      });

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(SAFEN_BACKGROUND_LOCATION_TASK);
    });
  });
});
