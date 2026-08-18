// Supabase Edge Function: send-feedback
//
// Triggered by a Database Webhook on INSERT into public.feedback.
// Sends feedback to your email via Resend (resend.com) — no SMTP,
// no Gmail app passwords, no port issues.
//
// Required secrets:
//   supabase secrets set RESEND_API_KEY=re_your_key_here
//   supabase secrets set GMAIL_ADDRESS=georgejnr31@gmail.com  (kept as recipient)
//
// Deploy:
//   supabase functions deploy send-feedback --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RECIPIENT_EMAIL = Deno.env.get('GMAIL_ADDRESS') ?? 'georgejnr31@gmail.com';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const feedback = payload.record;

    if (!feedback) {
      return new Response('No record in payload', { status: 400 });
    }

    if (!RESEND_API_KEY) {
      console.error('Missing RESEND_API_KEY secret');
      return new Response('Email not configured', { status: 500 });
    }

    // Look up who sent it
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', feedback.user_id)
      .maybeSingle();

    const senderLabel = profile?.full_name || profile?.email || feedback.user_id;

    const html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px;">
        <div style="background: #0A2463; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="color: #fff; margin: 0; font-size: 20px;">📬 New Safen Feedback</h2>
        </div>
        <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p><strong>From:</strong> ${senderLabel}</p>
          ${profile?.email ? `<p><strong>Email:</strong> ${profile.email}</p>` : ''}
          ${profile?.phone ? `<p><strong>Phone:</strong> ${profile.phone}</p>` : ''}
          <p><strong>User ID:</strong> ${feedback.user_id}</p>
          <p><strong>Submitted:</strong> ${new Date(feedback.created_at).toLocaleString()}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="white-space: pre-wrap; background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #0A2463;">
            ${escapeHtml(feedback.message)}
          </p>
        </div>
      </div>
    `;

    // Send via Resend API — simple HTTP, no SMTP needed
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Safen Feedback <onboarding@resend.dev>',
        to: [RECIPIENT_EMAIL],
        subject: `Safen Feedback from ${senderLabel}`,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return new Response(`Resend error: ${JSON.stringify(result)}`, { status: 500 });
    }

    console.log('Feedback email sent:', result.id);
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
