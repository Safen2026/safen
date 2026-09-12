/**
 * emergencySms.ts
 *
 * Offline fallback for SOS. When the device has no internet, opens the
 * native SMS composer pre-filled with a distress message so the user can
 * still reach their emergency contacts without a network connection.
 *
 * Strategy:
 *   1. expo-network checks reachability before trying Supabase.
 *   2. If offline, we fetch phone numbers from the local Supabase cache.
 *   3. expo-sms opens the native SMS composer (dev/bare build).
 *      Fallback: Linking.openURL for Expo Go (single recipient only).
 */

import { Linking } from 'react-native';
import * as Network from 'expo-network';
import * as SMS from 'expo-sms';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const getContactsCacheKey = (userId: string) => `safen_cached_contacts_${userId}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SmsContact = {
  name: string;
  phone: string;
};

export type SmsSendResult =
  | { success: true; sent: number }
  | { success: false; reason: 'no_contacts' | 'sms_unavailable' | 'cancelled' | 'error' };

// ── Network detection ─────────────────────────────────────────────────────────

/**
 * Returns true only when we have good reason to believe the device is online.
 *
 * Why not just use `isInternetReachable`?
 * On Android, `isInternetReachable` can return `null` when the OS has not yet
 * determined reachability. Treating `null` as `false` (offline) causes online
 * users to be incorrectly routed to the SMS fallback. We fix this with a
 * three-tier strategy:
 *   1. Explicit `false` from the OS → definitely offline.
 *   2. Both fields `true` → definitely online (fast path, no extra fetch).
 *   3. Ambiguous (`null`) → fire a lightweight HTTP probe with a 3s timeout.
 *      If the probe succeeds quickly the user is online; if it times out, offline.
 *
 * Defaults to true on any unexpected error so we never block the normal flow.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();

    // Definitive offline: OS explicitly says not connected or not reachable.
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;

    // Definitive online: connected AND reachability confirmed. Fast path.
    if (state.isConnected === true && state.isInternetReachable === true) return true;

    // Ambiguous: isConnected is true but isInternetReachable is null.
    // This is common on Android. Fire a lightweight probe to break the tie.
    // We use a 3s timeout — short enough not to delay the SMS fallback, long
    // enough for a slow but real connection to respond.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });
      return response.status === 204 || response.ok;
    } catch {
      return false; // Probe timed out or refused → treat as offline.
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[emergencySms] Network state check failed:', err);
    return true; // Fail-open: never accidentally block the normal Supabase flow.
  }
}

// ── Contact phone fetching ────────────────────────────────────────────────────

/**
 * Fetches all emergency contact phone numbers from Supabase.
 * Works even offline because the Supabase client uses a persisted local session.
 */
export async function getEmergencyContactPhones(userId: string): Promise<SmsContact[]> {
  try {
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('name, phone')
      .eq('user_id', userId)
      .eq('status', 'accepted')  // Only SMS contacts who have accepted the request
      .not('phone', 'is', null);

    if (!error && data) {
      type ContactRow = { name: string | null; phone: string | null };
      return (data as ContactRow[])
        .filter((c) => typeof c.phone === 'string' && c.phone.trim().length > 0)
        .map((c) => ({ name: c.name || 'Contact', phone: (c.phone as string).trim() }));
    }

    // Supabase query failed (likely offline) — fall back to AsyncStorage cache
    const cacheKey = getContactsCacheKey(userId);
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return [];

    type CachedContact = { name: string; phone: string; status: string };
    const cached: CachedContact[] = JSON.parse(raw);
    return cached
      .filter((c) => c.status === 'accepted' && c.phone?.trim().length > 0)
      .map((c) => ({ name: c.name || 'Contact', phone: c.phone.trim() }));
  } catch (err) {
    console.warn('Failed to fetch emergency contact phones:', err);
    return [];
  }
}

// ── SMS message builders ──────────────────────────────────────────────────────

function buildSmsBody(
  senderName: string,
  coords: { latitude: number; longitude: number } | null,
  type: string = 'sos',
  description?: string,
): string {
  const name = senderName || 'Someone you know';

  const typeMap: Record<string, string> = {
    police: 'Police',
    medical: 'Medical',
    fire: 'Fire',
    sos: 'SOS'
  };
  const emergencyType = typeMap[type] || 'SOS';

  let body = `\u{1F6A8} ${emergencyType} emergency - ${name} needs help!`;

  if (description?.trim()) {
    body += `\n\n\u{2139} Additional Info: ${description.trim()}`;
  }

  const locationLine = coords
    ? `\n\n\u{1F4CD} Location: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
    : '\n\n\u{1F4CD} Location unavailable — please call them immediately.';

  body += locationLine;
  body += '\n\nSent automatically by Safen because their phone has no internet.\nPlease respond or call them now.';

  return body;
}

/**
 * A shorter body for the sms: URL scheme Linking fallback.
 * Some OS URL handlers reject very long sms: URIs, so we strip optional fields.
 */
function buildShortSmsBody(
  senderName: string,
  coords: { latitude: number; longitude: number } | null,
  type: string = 'sos',
): string {
  const name = senderName || 'Someone you know';
  const typeMap: Record<string, string> = { police: 'Police', medical: 'Medical', fire: 'Fire', sos: 'SOS' };
  const emergencyType = typeMap[type] || 'SOS';

  let body = `EMERGENCY: ${name} needs help! (${emergencyType})`;
  if (coords) {
    body += ` Location: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
  }
  body += ' - Sent via Safen';
  return body;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Opens the native SMS composer pre-filled with a distress message.
 * Tries expo-sms first (all recipients); falls back to Linking for Expo Go.
 */
export async function sendEmergencySms(
  contacts: SmsContact[],
  senderName: string,
  coords: { latitude: number; longitude: number } | null,
  type: string = 'sos',
  description?: string,
): Promise<SmsSendResult> {
  if (contacts.length === 0) {
    return { success: false, reason: 'no_contacts' };
  }

  const body = buildSmsBody(senderName, coords, type, description);
  const phones = contacts.map((c) => c.phone);

  try {
    // ── expo-sms (bare/dev build) — all recipients at once ───────────────
    const isSmsAvailable = await SMS.isAvailableAsync();

    if (isSmsAvailable) {
      const { result } = await SMS.sendSMSAsync(phones, body);
      // 'unknown' on Android means the composer opened — treat as success
      if (result === 'sent' || result === 'unknown') {
        return { success: true, sent: phones.length };
      }
      if (result === 'cancelled') {
        return { success: false, reason: 'cancelled' };
      }
    }

    // ── Linking fallback (Expo Go / simulator) — primary contact only ─────
    // Use a shorter body here: sms: URIs with very long encoded bodies are
    // silently dropped by some OS URL handlers.
    const primaryPhone = phones[0];
    const shortBody = buildShortSmsBody(senderName, coords, type);
    const encodedBody = encodeURIComponent(shortBody);
    const smsUrl = `sms:${primaryPhone}?body=${encodedBody}`;
    const canOpen = await Linking.canOpenURL(smsUrl);

    if (canOpen) {
      await Linking.openURL(smsUrl);
      return { success: true, sent: 1 };
    }

    return { success: false, reason: 'sms_unavailable' };
  } catch (err) {
    console.warn('[emergencySms] error:', err);
    return { success: false, reason: 'error' };
  }
}
