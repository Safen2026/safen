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
import { supabase } from './supabase';

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
 * Returns true only when the device is BOTH connected AND internet-reachable.
 * Defaults to true on any unexpected error so we never accidentally block the
 * normal Supabase flow.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch {
    return true;
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
      .not('phone', 'is', null);

    if (error || !data) return [];

    type ContactRow = { name: string | null; phone: string | null };
    return (data as ContactRow[])
      .filter((c) => typeof c.phone === 'string' && c.phone.trim().length > 0)
      .map((c) => ({ name: c.name || 'Contact', phone: (c.phone as string).trim() }));
  } catch {
    return [];
  }
}

// ── SMS message builder ───────────────────────────────────────────────────────

function buildSmsBody(
  senderName: string,
  coords: { latitude: number; longitude: number } | null,
): string {
  const name = senderName || 'Someone you know';
  const locationLine = coords
    ? `\n\u{1F4CD} Location: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
    : '\n\u{1F4CD} Location unavailable — please call them immediately.';

  return (
    `\u{1F6A8} EMERGENCY — ${name} needs help!` +
    locationLine +
    '\n\nSent automatically by Safen because their phone has no internet.' +
    '\nPlease respond or call them now.'
  );
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
): Promise<SmsSendResult> {
  if (contacts.length === 0) {
    return { success: false, reason: 'no_contacts' };
  }

  const body = buildSmsBody(senderName, coords);
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
    const primaryPhone = phones[0];
    const encodedBody = encodeURIComponent(body);
    const canOpen = await Linking.canOpenURL(`sms:${primaryPhone}`);

    if (canOpen) {
      await Linking.openURL(`sms:${primaryPhone}?body=${encodedBody}`);
      return { success: true, sent: 1 };
    }

    return { success: false, reason: 'sms_unavailable' };
  } catch (err) {
    console.warn('[emergencySms] error:', err);
    return { success: false, reason: 'error' };
  }
}
