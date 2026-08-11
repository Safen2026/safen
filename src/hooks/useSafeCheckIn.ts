import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyCheckInMissed, notifyCheckInReminder, notifyCheckInDeadline } from '../lib/notifications';

// ─────────────────────────────────────────────
// Lazy-load Notifications — avoids crashes in Expo Go
// ─────────────────────────────────────────────
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch {}
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface CheckInSession {
  destination: string;
  durationMinutes: number;
  notifyContacts: boolean;
  startedAt: number;          // epoch ms
  deadlineAt: number;         // epoch ms  (startedAt + duration)
  reminderNotifId?: string;   // T-5 min reminder notification ID
  deadlineNotifId?: string;   // T+0 deadline notification ID
  contactAlertNotifId?: string; // T+5 min contact alert notification ID
  contactsAlerted?: boolean;  // true once notifyCheckInMissed has been called
}

const STORAGE_KEY = 'safen_active_check_in';

// ─────────────────────────────────────────────
// Notification channel setup (Android only)
// ─────────────────────────────────────────────
async function ensureChannel() {
  if (!Notifications) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('check_in', {
      name: 'Safe Check-In',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      description: 'Watchdog timer reminders and deadline alerts',
    });
  }
}

// ─────────────────────────────────────────────
// Schedule the two local notifications
//   1. Reminder — 5 minutes before deadline
//   2. Deadline — exactly at deadline
// ─────────────────────────────────────────────
async function scheduleCheckInNotifications(session: CheckInSession) {
  if (!Notifications) return {};

  await ensureChannel();

  const reminderAt = new Date(session.deadlineAt - 5 * 60 * 1000); // T-5 min
  const deadlineDate = new Date(session.deadlineAt);               // T+0
  const contactAlertAt = new Date(session.deadlineAt + 5 * 60 * 1000); // T+5 min

  const ids: { reminderNotifId?: string; deadlineNotifId?: string; contactAlertNotifId?: string } = {};

  // Only schedule the T-5 reminder if the deadline is more than 6 mins away
  if (reminderAt.getTime() - Date.now() > 60 * 1000) {
    ids.reminderNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Safe Check-In Reminder',
        body: `You're heading to ${session.destination}. You have 5 minutes left to confirm you're safe.`,
        sound: true,
        data: { type: 'check_in_reminder' },
      },
      trigger: { type: 'date', date: reminderAt, channelId: 'check_in' } as any,
    });
  }

  // Deadline notification — always schedule this
  ids.deadlineNotifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚨 Safe Check-In Required',
      body: `Your check-in for ${session.destination} has expired. Tap to confirm you're safe before your contacts are alerted.`,
      sound: true,
      data: { type: 'check_in_deadline' },
    },
    trigger: { type: 'date', date: deadlineDate, channelId: 'check_in' } as any,
  });

  // T+5 min — "Contacts have been alerted" notification to the user
  // This fires as a local push even if the app is killed
  if (contactAlertAt.getTime() > Date.now()) {
    ids.contactAlertNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 Contacts Have Been Alerted',
        body: `Your emergency contacts have been notified that you missed your check-in for ${session.destination}. Tap to confirm you're safe.`,
        sound: true,
        data: { type: 'check_in_contacts_alerted', destination: session.destination },
      },
      trigger: { type: 'date', date: contactAlertAt, channelId: 'check_in' } as any,
    });
  }

  return ids;
}

// Cancel any previously scheduled check-in notifications
async function cancelCheckInNotifications(session: Partial<CheckInSession>) {
  if (!Notifications) return;
  if (session.reminderNotifId) {
    await Notifications.cancelScheduledNotificationAsync(session.reminderNotifId).catch(() => {});
  }
  if (session.deadlineNotifId) {
    await Notifications.cancelScheduledNotificationAsync(session.deadlineNotifId).catch(() => {});
  }
  if ((session as any).contactAlertNotifId) {
    await Notifications.cancelScheduledNotificationAsync((session as any).contactAlertNotifId).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// Format time-left string for the Home card
// ─────────────────────────────────────────────
function formatTimeLeft(msLeft: number): string {
  if (msLeft <= 0) return 'Deadline passed — check in now!';
  const totalMins = Math.ceil(msLeft / 60000);
  const days = Math.floor(totalMins / (24 * 60));
  const hrs = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);

  return parts.length > 0 ? `${parts.join(' ')} left` : 'Less than a minute left';
}

// ─────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────
export function useSafeCheckIn() {
  const [session, setSession] = useState<CheckInSession | null>(null);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore persisted session on mount ────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const restored: CheckInSession = JSON.parse(raw);
        // If the restored deadline is still in the future, re-hydrate
        if (restored.deadlineAt > Date.now()) {
          setSession(restored);
        } else {
          // Deadline already passed — treat as expired
          setSession(restored);
          setIsExpired(true);
          AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    });
  }, []);

  // ── Tick timer every second ────────────────────────────────────
  useEffect(() => {
    if (!session) {
      if (tickRef.current) clearInterval(tickRef.current);
      setTimeLeftStr('');
      setIsExpired(false);
      return;
    }

    const tick = () => {
      const msLeft = session.deadlineAt - Date.now();
      setTimeLeftStr(formatTimeLeft(msLeft));
      if (msLeft <= 0 && !isExpired) {
        setIsExpired(true);
        // T+5 min: in a real app this triggers the SMS / Supabase edge function call.
        // We schedule that effect separately in useEffect below.
      }
    };

    tick(); // Run once immediately
    tickRef.current = setInterval(tick, 30_000); // Update every 30s

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [session, isExpired]);

  // ── At T-5 min → self-notify via Supabase (works in Expo Go) ──────────
  useEffect(() => {
    if (!session) return;
    const msUntilReminder = session.deadlineAt - 5 * 60 * 1000 - Date.now();
    if (msUntilReminder < 0) return; // Already past the reminder window
    const timer = setTimeout(() => {
      notifyCheckInReminder(session.destination);
    }, msUntilReminder);
    return () => clearTimeout(timer);
  }, [session]);

  // ── At T+0 → self-notify via Supabase (works in Expo Go) ────────────
  useEffect(() => {
    if (!session) return;
    const msUntilDeadline = session.deadlineAt - Date.now();
    if (msUntilDeadline < 0) return; // Already expired
    const timer = setTimeout(() => {
      notifyCheckInDeadline(session.destination);
    }, msUntilDeadline);
    return () => clearTimeout(timer);
  }, [session]);

  // ── At T+5 min → alert emergency contacts via Supabase ──────────
  // Uses BOTH a setTimeout (when app is in foreground) AND checks on every
  // app-foreground resume (via AppState in useNotifications) so it fires
  // even if the app was backgrounded/killed when the deadline passed.
  useEffect(() => {
    if (!session || !session.notifyContacts || session.contactsAlerted) return;

    const contactAlertTime = session.deadlineAt + 5 * 60 * 1000;
    const msUntilContactAlert = contactAlertTime - Date.now();

    // If we're already past T+5, fire immediately (catches app-resume scenario)
    if (msUntilContactAlert <= 0) {
      notifyCheckInMissed({ destination: session.destination }).then(() => {
        const updated = { ...session, contactsAlerted: true };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setSession(updated);
      });
      return;
    }

    // Otherwise schedule for when T+5 arrives while app is in foreground
    const timer = setTimeout(async () => {
      console.warn('[SafeCheckIn] T+5 min elapsed — alerting emergency contacts for:', session.destination);
      await notifyCheckInMissed({ destination: session.destination });
      // Mark as alerted so we don't double-fire on re-renders
      const updated = { ...session, contactsAlerted: true };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSession(updated);
    }, msUntilContactAlert);

    return () => clearTimeout(timer);
  }, [session]);

  // ── Start a new session ────────────────────────────────────────
  const startCheckIn = useCallback(async (data: {
    destination: string;
    durationMinutes: number;
    notifyContacts: boolean;
  }) => {
    const now = Date.now();
    const newSession: CheckInSession = {
      destination: data.destination,
      durationMinutes: data.durationMinutes,
      notifyContacts: data.notifyContacts,
      startedAt: now,
      deadlineAt: now + data.durationMinutes * 60 * 1000,
    };

    // Schedule notifications
    const notifIds = await scheduleCheckInNotifications(newSession);
    newSession.reminderNotifId = notifIds.reminderNotifId;
    newSession.deadlineNotifId = notifIds.deadlineNotifId;

    // Persist so it survives an app restart
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));

    setSession(newSession);
    setIsExpired(false);
  }, []);

  // ── Confirm safe — cancel the session & notifications ──────────
  const confirmSafe = useCallback(async () => {
    if (session) {
      await cancelCheckInNotifications(session);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    setSession(null);
    setIsExpired(false);
  }, [session]);

  // ── Cancel without confirming ──────────────────────────────────
  const cancelCheckIn = useCallback(async () => {
    if (session) {
      await cancelCheckInNotifications(session);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    setSession(null);
    setIsExpired(false);
  }, [session]);

  return {
    session,
    timeLeftStr,
    isExpired,
    startCheckIn,
    confirmSafe,
    cancelCheckIn,
    isActive: !!session,
  };
}
