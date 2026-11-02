import { supabase } from './supabase';

export type NotifyType =
  | 'sos' | 'medical' | 'police' | 'fire' | 'report'
  | 'check_in_missed' | 'check_in_reminder' | 'check_in_deadline' | 'sos_ack'
  | 'contact_added' | 'ping' | 'ping_ack';

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
  contact_added: 'Contact Request',
  ping: 'Check-in Ping',
  ping_ack: 'Ping Acknowledged',
};

type NotifyParams = {
  type: NotifyType;
  latitude?: number | null;
  longitude?: number | null;
  alertId?: string;
  reportId?: string;
  detailsSnippet?: string | null;
};

// Push delivery is handled server-side by the send-push Edge Function,
// which fires automatically via a Database Webhook on every notifications INSERT.

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

/** Returns IDs of all accepted on-app emergency contacts for a user. */
async function getAcceptedContactIds(userId: string): Promise<string[]> {
  const { data: contacts, error } = await supabase
    .from('emergency_contacts')
    .select('contact_user_id')
    .eq('user_id', userId)
    .eq('is_on_app', true)
    .eq('status', 'accepted')
    .not('contact_user_id', 'is', null);

  if (error || !contacts || contacts.length === 0) return [];
  return contacts.map(c => c.contact_user_id as string);
}

/**
 * Resolves the current user's session, display name, and accepted contact IDs
 * in parallel. Returns null if there is no authenticated session.
 * Used as a shared foundation for all fan-out notification functions.
 */
async function resolveNotificationContext(): Promise<{
  userId: string;
  senderName: string;
  contactIds: string[];
} | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const [senderName, contactIds] = await Promise.all([
    fetchSenderName(user.id),
    getAcceptedContactIds(user.id),
  ]);

  return { userId: user.id, senderName, contactIds };
}


// ─── Public API ────────────────────────────────────────────────────────────────

// Fires an in-app + push notification to every accepted emergency contact.
// Push delivery is handled server-side: inserting a row into `notifications`
// triggers the send-push Edge Function via a Database Webhook automatically.
// The client just writes the row — no direct Expo API calls needed.
export async function notifyEmergencyContacts(params: NotifyParams): Promise<void> {
  try {
    const ctx = await resolveNotificationContext();
    if (!ctx || ctx.contactIds.length === 0) return;
    const { userId, senderName, contactIds } = ctx;

    const label = TYPE_LABEL[params.type];
    const isEmergency = params.type !== 'report';
    const title = isEmergency ? `🚨 ${label}` : `New report from ${senderName}`;
    const body = params.detailsSnippet
      ? `${senderName}: ${params.detailsSnippet}`
      : isEmergency
        ? `${senderName} triggered a ${label.toLowerCase()} and may need help. Tap for details.`
        : `${senderName} filed a safety report near their location.`;

    const rows = contactIds.map(contactId => ({
      recipient_id: contactId,
      sender_id: userId,
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
    // Push is dispatched by the send-push Edge Function via Database Webhook.
  } catch (err) {
    console.warn('notifyEmergencyContacts error:', err);
  }
}

/**
 * Fans out an urgent alert to verified Safen users located in the same LGA/area.
 * Excludes the sender and any contacts who are already notified via notifyEmergencyContacts.
 *
 * Privacy model (Responder-Gated Disclosure):
 *   • Notification row: first name only + coarse coords (~11m) — enough to humanise
 *     the alert and let the recipient judge proximity. No full name, no exact unit.
 *   • Exact coords + full name: only unlocked server-side via get_community_alert_details()
 *     AFTER the recipient inserts a row into community_responders (i.e. taps "I'm Responding").
 */
export async function notifyCommunityNearby(params: {
  alertId: string;
  type: NotifyType;
  latitude?: number | null;
  longitude?: number | null;
  detailsSnippet?: string | null;
}): Promise<{ count: number }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return { count: 0 };

    // Get sender's profile to find their last_lga_code and sender name
    const [senderProfileRes, acceptedContacts] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, last_lga_code')  // last_state_code not needed here
        .eq('id', user.id)
        .maybeSingle(),
      getAcceptedContactIds(user.id),
    ]);

    const senderProfile = senderProfileRes.data;
    const lgaCode = senderProfile?.last_lga_code;
    const fullName = senderProfile?.full_name?.trim() || '';

    // Extract first name only — humanises the alert without exposing full identity
    const firstName = fullName.split(' ')[0] || 'Someone';

    if (!lgaCode) {
      console.warn('[notifyCommunityNearby] Sender has no last_lga_code; skipping community broadcast');
      return { count: 0 };
    }

    // Query profiles in the same LGA who have push enabled
    const { data: communityUsers, error: queryErr } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .eq('last_lga_code', lgaCode)
      .eq('push_enabled', true)
      .neq('id', user.id)
      .not('expo_push_token', 'is', null)
      .limit(50); // Bound community radius broadcast to prevent notification storms

    if (queryErr || !communityUsers || communityUsers.length === 0) {
      return { count: 0 };
    }

    // Filter out contacts who already received the private emergency contact notification
    const contactSet = new Set(acceptedContacts);
    const recipients = communityUsers.filter(u => !contactSet.has(u.id));

    if (recipients.length === 0) return { count: 0 };

    const label = TYPE_LABEL[params.type] || 'Emergency SOS';
    // Use first name to create an emotional hook that drives action.
    // "Sarah needs help nearby" is far more compelling than "Someone nearby".
    const title = `🚨 ${firstName} needs help — ${label}`;
    const body = `${firstName} triggered a distress signal nearby. Tap to see how close you are and decide if you can help.`;

    // PRIVACY & SAFETY: Round coordinates to 4 decimal places (~11m street-level)
    // so community recipients can gauge approximate distance without pinpointing
    // an exact room or apartment. Full coords unlock only after the user responds.
    const communityLat = params.latitude != null ? Math.round(params.latitude * 10000) / 10000 : null;
    const communityLng = params.longitude != null ? Math.round(params.longitude * 10000) / 10000 : null;

    const rows = recipients.map(r => ({
      recipient_id:          r.id,
      sender_id:             user.id,
      // First name only in the notification — full name gated behind respond action
      sender_name:           firstName,
      type:                  params.type,
      title,
      body,
      // Coarse coords only — exact coords gated behind respond action
      latitude:              communityLat,
      longitude:             communityLng,
      alert_id:              params.alertId,
      // Flag used by the client to route to the community alert screen
      // instead of the standard notification details modal.
      is_community_broadcast: true,
    }));

    const { error: insertErr } = await supabase.from('notifications').insert(rows);
    if (insertErr) {
      console.warn('[notifyCommunityNearby] failed to insert notifications:', insertErr.message);
      return { count: 0 };
    }

    return { count: rows.length };
  } catch (err) {
    console.warn('[notifyCommunityNearby] error:', err);
    return { count: 0 };
  }
}

/**
 * Sends a cancellation notification to emergency contacts (and nearby community if broadcast)
 * when the SOS owner cancels or resolves their alert.
 */
export async function notifySosCancelled(params: {
  alertId: string;
  hadCommunityBroadcast?: boolean;
}): Promise<void> {
  try {
    const ctx = await resolveNotificationContext();
    if (!ctx) return;
    const { userId, senderName, contactIds } = ctx;

    const allRecipientIds = new Set<string>(contactIds);

    // If community was also broadcast to, inform nearby community users so they stand down
    if (params.hadCommunityBroadcast) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_lga_code')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.last_lga_code) {
        const { data: communityUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('last_lga_code', profile.last_lga_code)
          .eq('push_enabled', true)
          .neq('id', userId)
          .not('expo_push_token', 'is', null)
          .limit(50);

        if (communityUsers) {
          for (const u of communityUsers) {
            allRecipientIds.add(u.id);
          }
        }
      }
    }

    if (allRecipientIds.size === 0) return;

    const rows = Array.from(allRecipientIds).map(recipientId => {
      const isContact = contactIds.includes(recipientId);
      return {
        recipient_id: recipientId,
        sender_id: userId,
        sender_name: isContact ? senderName : 'A neighbor',
        type: 'sos_ack' as NotifyType,
        title: isContact
          ? `✅ Emergency Cancelled — ${senderName}`
          : `✅ All Clear: Emergency Resolved Nearby`,
        body: isContact
          ? `${senderName} has cancelled their SOS. They are safe. No further action is needed.`
          : `The emergency alert reported nearby has been cancelled. All clear.`,
        alert_id: params.alertId,
      };
    });

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      console.warn('[notifySosCancelled] failed to insert notifications:', error.message);
    }
  } catch (err) {
    console.warn('[notifySosCancelled] error:', err);
  }
}


// Fans out to all accepted emergency contacts via the notifications table.
// Push is dispatched automatically by the send-push Edge Function webhook.
export async function notifyCheckInMissed(params: {
  destination: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const senderName = await fetchSenderName(user.id);
    const contactIds = await getAcceptedContactIds(user.id);
    if (contactIds.length === 0) {
      console.warn('notifyCheckInMissed: no contacts to notify');
      return;
    }

    const title = `⚠️ Missed Check-In: ${senderName}`;
    const body = `${senderName} was supposed to check in after heading to ${params.destination} but has not responded. Please check on them.`;

    const rows = contactIds.map(contactId => ({
      recipient_id: contactId,
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
    // Push is dispatched by the send-push Edge Function via Database Webhook.
  } catch (err) {
    console.warn('notifyCheckInMissed error:', err);
  }
}


// Inserts a self-notification for the user at T-5 so they see a reminder on
// the Notifications screen even in Expo Go (where local push doesn't fire).
export async function notifyCheckInReminder(destination: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return false;

    // ── Run all guards in parallel to minimise round-trip latency ────────────
    // 1. Relationship guard — only an accepted contact of the SOS owner can ack.
    // 2. Alert status — must still be 'active' (prevent post-cancel responses).
    // 3. Profile — responder's display name for the return notification.
    const [
      { data: contactRow, error: guardError },
      { data: alertRow,   error: alertErr   },
      { data: profile                        },
    ] = await Promise.all([
      supabase
        .from('emergency_contacts')
        .select('id')
        .eq('user_id', params.alertOwnerId)
        .eq('contact_user_id', user.id)
        .eq('status', 'accepted')
        .maybeSingle(),
      supabase
        .from('alerts')
        .select('status')
        .eq('id', params.alertId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (guardError) {
      console.warn('[SosAck] relationship guard query failed:', guardError.message);
      return false;
    }
    if (!contactRow) {
      console.warn('[SosAck] rejected: responder is not an accepted contact of the SOS owner.');
      return false;
    }

    if (alertErr) {
      console.warn('[SosAck] alert status check failed:', alertErr.message);
      return false;
    }
    if (!alertRow || alertRow.status !== 'active') {
      console.warn('[SosAck] rejected: alert is no longer active (status:', alertRow?.status ?? 'not found', ')');
      return false;
    }
    // ─────────────────────────────────────────────────────────────────────────

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
