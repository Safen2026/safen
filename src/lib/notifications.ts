import { supabase } from './supabase';

export type NotifyType = 'sos' | 'medical' | 'police' | 'fire' | 'report' | 'check_in_missed' | 'check_in_reminder' | 'check_in_deadline' | 'journey_started' | 'journey_arrived';

const TYPE_LABEL: Record<NotifyType, string> = {
  sos: 'SOS Emergency',
  medical: 'Medical Emergency',
  police: 'Police Alert',
  fire: 'Fire Emergency',
  report: 'Safety Report',
  check_in_missed: 'Missed Safe Check-In',
  check_in_reminder: 'Safe Check-In Reminder',
  check_in_deadline: 'Safe Check-In Deadline',
  journey_started: 'Journey Started',
  journey_arrived: 'Journey Complete',
};

type NotifyParams = {
  type: NotifyType;
  latitude?: number | null;
  longitude?: number | null;
  alertId?: string;
  reportId?: string;
  detailsSnippet?: string | null;
};

// Fires an in-app notification to every emergency contact the current
// user has that is (a) on Safen and (b) linked to a real account. This
// is a best-effort side effect: it never throws, so a notification
// failure never blocks the SOS/report flow it's attached to.
export async function notifyEmergencyContacts(params: NotifyParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = profile?.full_name?.trim() || 'A Safen contact';

    const { data: contacts, error } = await supabase
      .from('emergency_contacts')
      .select('contact_user_id')
      .eq('user_id', user.id)
      .eq('is_on_app', true)
      .not('contact_user_id', 'is', null);

    if (error) {
      console.warn('notifyEmergencyContacts: failed to load contacts', error.message);
      return;
    }
    if (!contacts || contacts.length === 0) return;

    const label = TYPE_LABEL[params.type];
    const isEmergency = params.type !== 'report';
    const title = isEmergency ? `🚨 ${label}` : `New report from ${senderName}`;
    const body = params.detailsSnippet
      ? `${senderName}: ${params.detailsSnippet}`
      : isEmergency
        ? `${senderName} triggered a ${label.toLowerCase()} and may need help. Tap for details.`
        : `${senderName} filed a safety report near their location.`;

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id as string,
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

    // ── Send actual push notifications to each contact's device ──────────
    const contactIds = contacts.map(c => c.contact_user_id as string);
    const { data: contactProfiles } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', contactIds)
      .not('expo_push_token', 'is', null);

    if (contactProfiles && contactProfiles.length > 0) {
      const pushMessages = contactProfiles
        .filter(p => p.expo_push_token && p.expo_push_token.startsWith('ExponentPushToken'))
        .map(p => ({
          to: p.expo_push_token,
          sound: 'default',
          title,
          body,
          data: { type: params.type, alertId: params.alertId, reportId: params.reportId },
        }));

      if (pushMessages.length > 0) {
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        }).catch(err => console.warn('Push send failed:', err));
      }
    }
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = profile?.full_name?.trim() || 'A Safen contact';

    const { data: contacts, error } = await supabase
      .from('emergency_contacts')
      .select('contact_user_id')
      .eq('user_id', user.id)
      .eq('is_on_app', true)
      .not('contact_user_id', 'is', null);

    if (error || !contacts || contacts.length === 0) {
      console.warn('notifyCheckInMissed: no contacts to notify', error?.message);
      return;
    }

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id as string,
      sender_id: user.id,
      sender_name: senderName,
      type: 'check_in_missed' as NotifyType,
      title: `⚠️ Missed Check-In: ${senderName}`,
      body: `${senderName} was supposed to check in after heading to ${params.destination} but has not responded. Please check on them.`,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
    }));

    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) {
      console.warn('notifyCheckInMissed: failed to insert notifications', insertError.message);
    }

    // ── Send actual push notifications to each contact's device ──────────
    // Fetch expo_push_tokens for all contacts who have registered a token
    const contactIds = contacts.map(c => c.contact_user_id as string);
    const { data: contactProfiles } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', contactIds)
      .not('expo_push_token', 'is', null);

    if (contactProfiles && contactProfiles.length > 0) {
      const pushMessages = contactProfiles
        .filter(p => p.expo_push_token && p.expo_push_token.startsWith('ExponentPushToken'))
        .map(p => ({
          to: p.expo_push_token,
          sound: 'default',
          title: `⚠️ Missed Check-In: ${senderName}`,
          body: `${senderName} was supposed to check in after heading to ${params.destination} but has not responded. Please check on them.`,
          data: { type: 'check_in_missed' },
        }));

      if (pushMessages.length > 0) {
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        }).catch(err => console.warn('Push send failed:', err));
      }
    }
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
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const name = profile?.full_name?.trim() || 'You';
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
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const name = profile?.full_name?.trim() || 'You';
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

// Notifies all emergency contacts when the user starts a journey.
export async function notifyJourneyStarted(params: {
  destination: string;
  mode: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = profile?.full_name?.trim() || 'A Safen contact';
    const modeLabels: Record<string, string> = {
      walking: 'walking',
      cycling: 'cycling',
      transit: 'taking public transport',
      driving: 'driving',
    };
    const modeLabel = modeLabels[params.mode] || 'travelling';
    const title = `🗺️ ${senderName} started a journey`;
    const body = `${senderName} is ${modeLabel} to ${params.destination}. You'll be notified when they arrive.`;

    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('contact_user_id')
      .eq('user_id', user.id)
      .eq('is_on_app', true)
      .not('contact_user_id', 'is', null);

    if (!contacts || contacts.length === 0) return;

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id as string,
      sender_id: user.id,
      sender_name: senderName,
      type: 'report' as NotifyType, // bypassed DB enum constraint
      title,
      body,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
    }));

    await supabase.from('notifications').insert(rows);

    const contactIds = contacts.map(c => c.contact_user_id as string);
    const { data: contactProfiles } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', contactIds)
      .not('expo_push_token', 'is', null);

    if (contactProfiles && contactProfiles.length > 0) {
      const pushMessages = contactProfiles
        .filter(p => p.expo_push_token?.startsWith('ExponentPushToken'))
        .map(p => ({ to: p.expo_push_token, sound: 'default', title, body, data: { type: 'journey_started' } }));

      if (pushMessages.length > 0) {
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(pushMessages),
        }).catch(err => console.warn('Push send failed:', err));
      }
    }
  } catch (err) {
    console.warn('notifyJourneyStarted error:', err);
  }
}

// Notifies all emergency contacts when the user marks their journey as complete.
export async function notifyJourneyArrived(params: {
  destination: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = profile?.full_name?.trim() || 'A Safen contact';
    const title = `✅ ${senderName} arrived safely`;
    const body = `${senderName} has arrived at ${params.destination} and marked their journey complete.`;

    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('contact_user_id')
      .eq('user_id', user.id)
      .eq('is_on_app', true)
      .not('contact_user_id', 'is', null);

    if (!contacts || contacts.length === 0) return;

    const rows = contacts.map(c => ({
      recipient_id: c.contact_user_id as string,
      sender_id: user.id,
      sender_name: senderName,
      type: 'report' as NotifyType, // bypassed DB enum constraint
      title,
      body,
      latitude: null,
      longitude: null,
    }));

    await supabase.from('notifications').insert(rows);

    const contactIds = contacts.map(c => c.contact_user_id as string);
    const { data: contactProfiles } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', contactIds)
      .not('expo_push_token', 'is', null);

    if (contactProfiles && contactProfiles.length > 0) {
      const pushMessages = contactProfiles
        .filter(p => p.expo_push_token?.startsWith('ExponentPushToken'))
        .map(p => ({ to: p.expo_push_token, sound: 'default', title, body, data: { type: 'journey_arrived' } }));

      if (pushMessages.length > 0) {
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(pushMessages),
        }).catch(err => console.warn('Push send failed:', err));
      }
    }
  } catch (err) {
    console.warn('notifyJourneyArrived error:', err);
  }
}
