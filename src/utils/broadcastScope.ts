import AsyncStorage from '@react-native-async-storage/async-storage';

export type BroadcastScope = 'both' | 'contacts_only';

export const BROADCAST_SCOPE_STORAGE_KEY = '@safen_sos_broadcast_scope';

export interface ScopeOptionMeta {
  scope: BroadcastScope;
  title: string;
  badge: string;
  description: string;
  icon: 'shield-checkmark' | 'lock-closed';
  accentColor: string;
}

export const SCOPE_OPTIONS: Record<BroadcastScope, ScopeOptionMeta> = {
  both: {
    scope: 'both',
    title: 'Contacts & Nearby Community',
    badge: 'Contacts & Community (800m)',
    description: 'Alerts your emergency contacts and notifies verified Safen users within ~800m for immediate first response.',
    icon: 'shield-checkmark',
    accentColor: '#10B981', // emerald
  },
  contacts_only: {
    scope: 'contacts_only',
    title: 'Contacts Only (Discreet)',
    badge: 'Contacts Only (Discreet)',
    description: 'Only alerts your trusted emergency contacts. Keeps all alerts completely private from neighbors.',
    icon: 'lock-closed',
    accentColor: '#F59E0B', // amber
  },
};

/**
 * Reads the user's saved broadcast scope preference from local storage.
 * Defaults to 'both' (community first-responder network).
 */
export async function getStoredBroadcastScope(): Promise<BroadcastScope> {
  try {
    const stored = await AsyncStorage.getItem(BROADCAST_SCOPE_STORAGE_KEY);
    if (stored === 'contacts_only' || stored === 'both') {
      return stored;
    }
  } catch (err) {
    console.warn('[broadcastScope] Failed to read stored scope:', err);
  }
  return 'both';
}

/**
 * Persists the user's broadcast scope preference to local storage.
 */
export async function setStoredBroadcastScope(scope: BroadcastScope): Promise<void> {
  try {
    await AsyncStorage.setItem(BROADCAST_SCOPE_STORAGE_KEY, scope);
  } catch (err) {
    console.warn('[broadcastScope] Failed to write stored scope:', err);
  }
}
