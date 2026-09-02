import { supabase } from './supabase';

export type NotifyType = 'sos' | 'medical' | 'police' | 'fire' | 'report' | 'check_in_missed' | 'check_in_reminder' | 'check_in_deadline' | 'sos_ack';

const TYPE_LABEL: Record<NotifyType, string> = {
  sos: 'SOS Emergency',
  medical: 'Medical Emergency',
  police: 'Police Alert',
  fire: 'Fire Emergency',
  report: 'Safety Report',
  check_in_missed: 'Missed Safe Check-In',
  check_in_reminder: 'Safe Check-In Reminder',
  check_in_deadline: 'Safe Check-In Deadline',
  sos_ack: 'SOS Response',
};

type NotifyParams = {
  type: NotifyType;
  latitude?: number | null;
  longitude?: number | null;
  alertId?: string;
  reportId?: string;
  detailsSnippet?: string | null;
};

type PushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// ─── Private Helpers ─────────────────────────────────────────────────────────

/** Fetches the display name for a user. Falls back to a safe default. */
async function fetchSenderName(userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return profile?.full_name?.trim() || 'A Safen contact';
}

type ContactWithToken = { contact_user_id: string; expo_push_token: string | null };

/**
 * Returns all accepted emergency contacts for a user that are on the app,
 * including their Expo push token (may be null).
 * This is the single source of truth for the security-critical `.eq('status', 'accepted')` filter.
 */
async function getAcceptedContactsWithTokens(userId: string): Promise<ContactWithToken[]> {
  const { data: contacts, error: contactsError } = await supabase
    .from('emergency_contacts')
    .select('contact_user_id')
    .eq('user_id', userId)
    .eq('is_on_app', true)
    .eq('status', 'accepted')
    .not('contact_user_id', 'is', null);

  if (contactsError || !contacts || contacts.length === 0) {
    return [];
  }

  const contactIds = contacts.map(c => c.contact_user_id as string);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', contactIds);

  return (contacts as { contact_user_id: string }[]).map(c => {
    const profile = profiles?.find(p => p.id === c.contact_user_id);
    return { contact_user_id: c.contact_user_id, expo_push_token: profile?.expo_push_token ?? null };
  });
}

/** Fires push messages to Expo's API. Best-effort — never throws. */
function firePush(messages: PushMessage[]): void {
  if (messages.length === 0) return;
  fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(messages),
  }).catch(err => console.warn('Push send failed:', err));
}

// ─── Public API ────────────────────────────────────────────────────────────────

// Fires an in-app notification to every emergency contact the current
// user has that is (a) on Safen and (b) linked to a real account. This
// is a best-effort side effect: it never throws, so a notification
// failure never blocks the SOS/report flow it's attached to.
export async function notifyEmergencyContacts(params: NotifyParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const senderName = await fetchSenderName(user.id);
    const contacts = await getAcceptedContactsWithTokens(user.id);
    if (contacts.length === 0) return;

    const label = TYPE_LABEL[params.type];
    const isEmergency = params.type !== 'report';
    const title = isEmergency ? `🚨 ${label}` : `New report from ${senderName}`;
    const body = params.detailsSnippet
      ? `${senderName}: ${params.detailsSnippet}`
      : isEmergency
        ? `${senderName} triggered a ${label.toLowerCase()} and may need help. Tap for details.`
        : `${senderName} filed a safety report near their location.`;

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id,
      sender_id: user.id,
      sender_name: senderName,
      type: params.type,
      title,
      body,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      alert_id: params.alertId ?? null,
      report_id: params.reportId ?? null,
    }));

    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) {
      console.warn('notifyEmergencyContacts: failed to insert notifications', insertError.message);
    }

    const pushMessages: PushMessage[] = contacts
      .filter(c => c.expo_push_token?.startsWith('ExponentPushToken'))
      .map(c => ({
        to: c.expo_push_token as string,
        sound: 'default' as const,
        title,
        body,
        data: { type: params.type, alertId: params.alertId, reportId: params.reportId },
      }));

    firePush(pushMessages);
  } catch (err) {
    console.warn('notifyEmergencyContacts error:', err);
  }
}

// Fired when a user's Safe Check-In deadline passes and they haven't confirmed.
// This fans out a notification to all their accepted emergency contacts so they
// appear on the contacts' Notifications screen — works in Expo Go too since
// it goes through Supabase, not local push.
export async function notifyCheckInMissed(params: {
  destination: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const senderName = await fetchSenderName(user.id);
    const contacts = await getAcceptedContactsWithTokens(user.id);
    if (contacts.length === 0) {
      console.warn('notifyCheckInMissed: no contacts to notify');
      return;
    }

    const title = `⚠️ Missed Check-In: ${senderName}`;
    const body = `${senderName} was supposed to check in after heading to ${params.destination} but has not responded. Please check on them.`;

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id,
      sender_id: user.id,
      sender_name: senderName,
      type: 'check_in_missed' as NotifyType,
      title,
      body,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
    }));

    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) {
      console.warn('notifyCheckInMissed: failed to insert notifications', insertError.message);
    } else {
      if (__DEV__) console.log('[SafeCheckIn] Contact notifications sent for missed check-in.');
    }

    const pushMessages: PushMessage[] = contacts
      .filter(c => c.expo_push_token?.startsWith('ExponentPushToken'))
      .map(c => ({
        to: c.expo_push_token as string,
        sound: 'default' as const,
        title,
        body,
        data: { type: 'check_in_missed' },
      }));

    firePush(pushMessages);
  } catch (err) {
    console.warn('notifyCheckInMissed error:', err);
  }
}


// Inserts a self-notification for the user at T-5 so they see a reminder on
// the Notifications screen even in Expo Go (where local push doesn't fire).
export async function notifyCheckInReminder(destination: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const name = await fetchSenderName(user.id);
    await supabase.from('notifications').insert({
      recipient_id: user.id,
      sender_id: user.id,
      sender_name: name,
      type: 'check_in_reminder',
      title: '⏰ Check-In Reminder',
      body: `You have 5 minutes left to confirm you're safe at ${destination}. Tap to check in now.`,
    });
  } catch (err) {
    console.warn('notifyCheckInReminder error:', err);
  }
}

// Inserts a self-notification at the exact deadline (T+0) so the user gets
// an urgent alert on their Notifications screen in Expo Go.
export async function notifyCheckInDeadline(destination: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const name = await fetchSenderName(user.id);
    await supabase.from('notifications').insert({
      recipient_id: user.id,
      sender_id: user.id,
      sender_name: name,
      type: 'check_in_deadline',
      title: '🚨 Check-In Deadline Reached',
      body: `Your safe check-in for ${destination} has expired. Confirm you're safe now, or your contacts will be alerted in 5 minutes.`,
    });
  } catch (err) {
    console.warn('notifyCheckInDeadline error:', err);
  }
}

// Fired when a user adds another Safen user as an emergency contact.
// This is a direct 1:1 notification (not a fan-out), so it's kept
// separate from notifyEmergencyContacts above.
export async function notifyContactAdded(recipientId: string, adderName: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_name: adderName,
      type: 'contact_added',
      title: `${adderName} added you`,
      body: `${adderName} added you as an emergency contact on Safen. You'll be notified if they ever trigger an alert or file a report.`,
    });

    if (error) console.warn('notifyContactAdded failed:', error.message);
  } catch (err) {
    console.warn('notifyContactAdded error:', err);
  }
}

export async function sendContactRequest(recipientId: string, adderName: string, contactId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_name: adderName,
      type: 'contact_added',
      title: 'Contact Request',
      body: `${adderName} wants to add you as an emergency contact.`
    });

    if (error) console.warn('sendContactRequest failed:', error.message);
  } catch (err) {
    console.warn('sendContactRequest error:', err);
  }
}

export async function notifyContactRequestResult(recipientId: string, myName: string, action: 'accepted' | 'rejected'): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const title = action === 'accepted' ? 'Request Accepted' : 'Request Declined';
    const body = action === 'accepted' 
      ? `${myName} accepted your emergency contact request.` 
      : `${myName} declined your emergency contact request.`;

    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_name: myName,
      type: 'contact_added',
      title,
      body,
    });

    if (error) console.warn('notifyContactRequestResult failed:', error.message);
  } catch (err) {
    console.warn('notifyContactRequestResult error:', err);
  }
}

export async function sendPing(recipientId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = profile?.full_name?.trim() || 'A Safen user';

    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_name: senderName,
      type: 'ping',
      title: 'Check-in Ping',
      body: `${senderName} sent you a check-in ping to make sure you're safe.`
    });

    if (error) {
      console.warn('sendPing failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('sendPing error:', err);
    return false;
  }
}

export async function sendPingAck(recipientId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const myName = profile?.full_name?.trim() || 'A Safen user';

    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_name: myName,
      type: 'ping_ack',
      title: 'Ping Acknowledged',
      body: `${myName} acknowledged your check-in ping and is safe.`
    });

    if (error) {
      console.warn('sendPingAck failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('sendPingAck error:', err);
    return false;
  }
}



// ─── SOS Acknowledgement ──────────────────────────────────────────────────────
// Called when an emergency contact taps a response button on an SOS notification.
// 1. Upserts a row into alert_acknowledgements (idempotent).
// 2. Sends a return notification to the SOS sender.

export type SosAckResponse = 'on_my_way' | 'calling_you' | 'alerting_authorities' | 'cant_help';

const ACK_LABEL: Record<SosAckResponse, { emoji: string; label: string; body: (name: string) => string }> = {
  on_my_way:             { emoji: '🚗', label: 'On My Way',             body: (n) => `${n} is on their way to help you.` },
  calling_you:           { emoji: '📞', label: 'Calling You',           body: (n) => `${n} is calling you right now.` },
  alerting_authorities:  { emoji: '🚨', label: 'Alerting Authorities',  body: (n) => `${n} is contacting emergency services on your behalf.` },
  cant_help:             { emoji: '❌', label: "Can't Help",            body: (n) => `${n} has seen your alert but is unable to respond right now.` },
};

export async function sendSosAcknowledgement(params: {
  alertId: string;
  alertOwnerId: string; // the user_id who triggered the SOS
  response: SosAckResponse;
}): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const myName = profile?.full_name?.trim() || 'Your contact';

    const meta = ACK_LABEL[params.response];

    // 1. Upsert acknowledgement row (idempotent — contact can change response)
    const { error: upsertError } = await supabase
      .from('alert_acknowledgements')
      .upsert(
        { alert_id: params.alertId, contact_id: user.id, response: params.response },
        { onConflict: 'alert_id,contact_id' }
      );

    if (upsertError) {
      console.warn('[SosAck] upsert failed:', upsertError.message);
      return false;
    }

    // 2. Send return notification to the SOS owner
    const { error: notifyError } = await supabase.from('notifications').insert({
      recipient_id: params.alertOwnerId,
      sender_id: user.id,
      sender_name: myName,
      type: 'sos_ack' as NotifyType, 
      title: `${meta.emoji} ${myName} — ${meta.label}`,
      body: meta.body(myName),
      alert_id: params.alertId,
    });

    if (notifyError) {
      console.warn('[SosAck] notify failed:', notifyError.message);
    }

    // 3. Insert into Live SOS Feed (sos_events) so it appears in the timeline
    const { error: eventError } = await supabase.from('sos_events').insert({
      alert_id: params.alertId,
      event_type: 'contact_ack',
      message: `${myName}: ${meta.label}`,
      actor_id: user.id
    });

    if (eventError) {
      console.warn('[SosAck] feed insert failed:', eventError.message);
    }

    return true;
  } catch (err) {
    console.warn('[SosAck] error:', err);
    return false;
  }
}
