// Supabase Edge Function: send-feedback
//
// Triggered by a Database Webhook on INSERT into public.feedback.
// Sends the feedback message to your Gmail inbox via Gmail's SMTP
// server, using an App Password (NOT your regular Gmail password —
// Gmail SMTP requires 2-Step Verification + an App Password).
//
// Required secrets (set these, don't hardcode them):
//   supabase secrets set GMAIL_ADDRESS=georgejnr31@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD=your16charapppassword
//
// Deploy:
//   supabase functions deploy send-feedback --no-verify-jwt
//
// Then: Dashboard → Integrations → Database Webhooks → Create a new
// hook → table = feedback, event = Insert, type = Supabase Edge
// Functions, function = send-feedback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_ADDRESS = Deno.env.get('GMAIL_ADDRESS')!;
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Database Webhook payload shape: { type: 'INSERT', table, record, ... }
    const feedback = payload.record;
    if (!feedback) {
      return new Response('No record in payload', { status: 400 });
    }

    if (!GMAIL_ADDRESS || !GMAIL_APP_PASSWORD) {
      console.error('Missing GMAIL_ADDRESS or GMAIL_APP_PASSWORD secret');
      return new Response('Email not configured', { status: 500 });
    }

    // Look up who sent it, so the email is actually useful.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', feedback.user_id)
      .maybeSingle();

    const senderLabel = profile?.full_name || profile?.email || feedback.user_id;

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_ADDRESS,
          password: GMAIL_APP_PASSWORD,
        },
      },
    });

    await client.send({
      from: GMAIL_ADDRESS,
      to: GMAIL_ADDRESS,
      subject: `Safen Feedback from ${senderLabel}`,
      content: 'auto', // fallback plain text derived from html
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <h2>New Safen Feedback</h2>
          <p><strong>From:</strong> ${senderLabel}</p>
          ${profile?.email ? `<p><strong>Email:</strong> ${profile.email}</p>` : ''}
          ${profile?.phone ? `<p><strong>Phone:</strong> ${profile.phone}</p>` : ''}
          <p><strong>User ID:</strong> ${feedback.user_id}</p>
          <p><strong>Submitted:</strong> ${feedback.created_at}</p>
          <hr />
          <p style="white-space: pre-wrap;">${escapeHtml(feedback.message)}</p>
        </div>
      `,
    });

    await client.close();

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('send-feedback error:', err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
