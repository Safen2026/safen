import { supabase } from './supabase';

export type NotifyType = 'sos' | 'medical' | 'police' | 'fire' | 'report';

const TYPE_LABEL: Record<NotifyType, string> = {
  sos: 'SOS Emergency',
  medical: 'Medical Emergency',
  police: 'Police Alert',
  fire: 'Fire Emergency',
  report: 'Safety Report',
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
  } catch (err) {
    console.warn('notifyEmergencyContacts error:', err);
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
