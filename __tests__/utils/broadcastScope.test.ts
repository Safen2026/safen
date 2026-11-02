import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getStoredBroadcastScope,
  setStoredBroadcastScope,
  BROADCAST_SCOPE_STORAGE_KEY,
  SCOPE_OPTIONS,
  type BroadcastScope,
} from '../../src/utils/broadcastScope';

describe('broadcastScope utility', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('getStoredBroadcastScope', () => {
    it('defaults to "both" when nothing is stored', async () => {
      const scope = await getStoredBroadcastScope();
      expect(scope).toBe('both');
    });

    it('returns "contacts_only" when stored in AsyncStorage', async () => {
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, 'contacts_only');
      const scope = await getStoredBroadcastScope();
      expect(scope).toBe('contacts_only');
    });

    it('returns "both" when stored in AsyncStorage', async () => {
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, 'both');
      const scope = await getStoredBroadcastScope();
      expect(scope).toBe('both');
    });

    it('falls back to "both" when invalid/corrupt value is stored', async () => {
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, 'corrupt_val');
      const scope = await getStoredBroadcastScope();
      expect(scope).toBe('both');
    });

    it('falls back to "both" when stored value is "null" or "undefined" string', async () => {
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, 'null');
      expect(await getStoredBroadcastScope()).toBe('both');
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, 'undefined');
      expect(await getStoredBroadcastScope()).toBe('both');
      await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, '');
      expect(await getStoredBroadcastScope()).toBe('both');
    });

    it('SAD PATH: falls back to "both" and does not throw when AsyncStorage.getItem rejects', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Disk read error / sandbox permission denied'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const scope = await getStoredBroadcastScope();
      expect(scope).toBe('both');
      expect(warnSpy).toHaveBeenCalledWith(
        '[broadcastScope] Failed to read stored scope:',
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });

  describe('setStoredBroadcastScope', () => {
    it('persists contacts_only to AsyncStorage', async () => {
      await setStoredBroadcastScope('contacts_only');
      const stored = await AsyncStorage.getItem(BROADCAST_SCOPE_STORAGE_KEY);
      expect(stored).toBe('contacts_only');
    });

    it('persists both to AsyncStorage', async () => {
      await setStoredBroadcastScope('both');
      const stored = await AsyncStorage.getItem(BROADCAST_SCOPE_STORAGE_KEY);
      expect(stored).toBe('both');
    });

    it('SAD PATH: handles AsyncStorage.setItem rejection without throwing', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Quota exceeded'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(setStoredBroadcastScope('contacts_only')).resolves.not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        '[broadcastScope] Failed to write stored scope:',
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });

  describe('SCOPE_OPTIONS metadata', () => {
    it('defines metadata for both scopes', () => {
      expect(SCOPE_OPTIONS.both).toBeDefined();
      expect(SCOPE_OPTIONS.contacts_only).toBeDefined();
    });

    it('both scope has shield icon and emerald accent', () => {
      expect(SCOPE_OPTIONS.both.icon).toBe('shield-checkmark');
      expect(SCOPE_OPTIONS.both.accentColor).toBe('#10B981');
    });

    it('contacts_only scope has lock icon and amber accent', () => {
      expect(SCOPE_OPTIONS.contacts_only.icon).toBe('lock-closed');
      expect(SCOPE_OPTIONS.contacts_only.accentColor).toBe('#F59E0B');
    });
  });
});
