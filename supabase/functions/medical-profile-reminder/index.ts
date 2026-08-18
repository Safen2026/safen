// Supabase Edge Function: medical-profile-reminder
//
// Runs on a cron schedule — nudges users who haven't filled their
// medical profile. Three-stage drip so it never feels spammy:
//   • 7 days after signup  → first gentle nudge (profile still empty)
//   • 30 days after signup → second nudge (profile still <50% filled)
//   • Monthly after that   → ongoing nudge (profile still incomplete)
//
// Deploy:
//   supabase functions deploy medical-profile-reminder --no-verify-jwt
//
// Schedule (Dashboard → Edge Functions → medical-profile-reminder → Schedule):
//   0 9 * * *   (every day at 9am UTC — catches both nudge windows)
//
// Requires no extra secrets beyond the built-in SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, since it only writes to the DB and
// fires Expo push notifications directly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface MedicalProfileRecord {
  blood_type?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  allergies?: string[] | null;
  conditions?: string[] | null;
  medications?: string[] | null;
  doctor_name?: string | null;
  doctor_phone?: string | null;
}

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, string>;
}

const calcCompleteness = (mp: MedicalProfileRecord | null | undefined): number => {
  if (!mp) return 0;
  const checks = [
    !!mp.blood_type,
    !!mp.height_cm,
    !!mp.weight_kg,
    Array.isArray(mp.allergies) && mp.allergies.length > 0,
    Array.isArray(mp.conditions) && mp.conditions.length > 0,
    Array.isArray(mp.medications) && mp.medications.length > 0,
    !!mp.doctor_name,
    !!mp.doctor_phone,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

Deno.serve(async () => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    // Fetch all profiles with their medical profile and push token
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(`
        id, created_at, expo_push_token, push_enabled,
        medical_reminder_sent_at,
        medical_profiles (
          blood_type, height_cm, weight_kg, allergies,
          conditions, medications, doctor_name, doctor_phone
        )
      `)
      .eq('push_enabled', true)
      .not('expo_push_token', 'is', null);

    if (error) {
      console.error('Failed to fetch profiles:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }

    const messages: ExpoPushMessage[] = [];
    const updatedIds: string[] = [];

    for (const profile of profiles ?? []) {
      const mp = Array.isArray(profile.medical_profiles)
        ? profile.medical_profiles[0]
        : profile.medical_profiles;

      const completeness = calcCompleteness(mp);
      if (completeness === 100) continue; // fully filled — skip

      const createdAt = new Date(profile.created_at);
      const lastSent = profile.medical_reminder_sent_at
        ? new Date(profile.medical_reminder_sent_at)
        : null;

      // Never resend within 30 days
      if (lastSent && lastSent > new Date(thirtyDaysAgoIso)) continue;

      const daysSinceSignup = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      let shouldSend = false;
      let title = '';
      let body = '';

      if (daysSinceSignup >= 7 && daysSinceSignup < 8 && !lastSent && completeness === 0) {
        // First nudge: 7 days after signup, profile still empty
        shouldSend = true;
        title = '🏥 Your Medical Profile is empty';
        body = 'Add your blood type and allergies so first responders can help you faster in an emergency. Takes less than 2 minutes.';
      } else if (daysSinceSignup >= 30 && daysSinceSignup < 31 && completeness < 50) {
        // Second nudge: 30 days after signup, still less than half filled
        shouldSend = true;
        title = '🩺 Complete your Medical Profile';
        body = `Your profile is ${completeness}% complete. Adding a few more details could save your life in an emergency.`;
      } else if (lastSent && lastSent <= new Date(thirtyDaysAgoIso) && completeness < 100) {
        // Monthly ongoing nudge for anyone still incomplete
        shouldSend = true;
        title = '📋 Medical Profile reminder';
        body = `Your Safen medical profile is ${completeness}% complete. Keep going — every detail helps first responders.`;
      }

      if (!shouldSend || !profile.expo_push_token) continue;

      messages.push({
        to: profile.expo_push_token,
        title,
        body,
        sound: 'default',
        data: { screen: 'medical-profile' },
      });
      updatedIds.push(profile.id);
    }

    if (messages.length === 0) {
      return new Response('No reminders to send', { status: 200 });
    }

    // Send push notifications in batches of 100 (Expo limit)
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
    }

    // Record when we sent each reminder
    if (updatedIds.length > 0) {
      await supabase
        .from('profiles')
        .update({ medical_reminder_sent_at: now.toISOString() })
        .in('id', updatedIds);
    }

    console.log(`Sent ${messages.length} medical profile reminders`);
    return new Response(`Sent ${messages.length} reminders`, { status: 200 });
  } catch (err) {
    console.error('medical-profile-reminder error:', err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
});