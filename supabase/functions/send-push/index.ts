// supabase/functions/send-push/index.ts
//
// Triggered by a Database Webhook on INSERT into public.notifications.
//
// Architecture:
//   1. Validate the shared webhook secret (fails closed if unset).
//   2. Re-fetch the notification row from the DB by its ID — we NEVER
//      trust the webhook payload content for the message we send.
//   3. Look up the recipient expo_push_token.
//   4. Send to Expo push gateway.
//   5. Read ticket response and null out any DeviceNotRegistered tokens.
//
// Environment variables (set in Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              — injected automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
//   PUSH_WEBHOOK_SECRET       — generate any long random string

import { createClient } from "npm:@supabase/supabase-js@^2";
import { secretMatches, WEBHOOK_SECRET_HEADER } from "../_shared/auth.ts";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");

const EXPO_PUSH_URL  = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: { id: string } | null;
}

async function sendInBatches(messages: Record<string, unknown>[]): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error("[send-push] Expo rejected batch:", await res.text());
      tickets.push(...batch.map(() => ({ status: "error" as const })));
      continue;
    }
    const json = await res.json() as { data: ExpoTicket[] };
    tickets.push(...(json.data ?? []));
  }
  return tickets;
}

async function purgeDeadTokens(
  db: ReturnType<typeof createClient>,
  recipientIds: string[],
  tickets: ExpoTicket[],
): Promise<void> {
  const deadIds: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      deadIds.push(recipientIds[i]);
    }
  });
  if (deadIds.length === 0) return;
  const { error } = await db.from("profiles").update({ expo_push_token: null }).in("id", deadIds);
  if (error) console.error("[send-push] Failed to purge dead tokens:", error.message);
  else console.log(`[send-push] Purged ${deadIds.length} dead token(s).`);
}

Deno.serve(async (req) => {
  // 1. Authenticate — verify_jwt is OFF, shared secret is the only gate.
  if (!(await secretMatches(req.headers.get(WEBHOOK_SECRET_HEADER), PUSH_WEBHOOK_SECRET))) {
    console.warn("[send-push] Rejected: bad or missing webhook secret.");
    return new Response("unauthorized", { status: 401 });
  }

  // 2. Parse webhook body
  let payload: WebhookPayload;
  try { payload = await req.json(); }
  catch { return new Response("bad json", { status: 400 }); }

  if (payload.type !== "INSERT" || payload.table !== "notifications") {
    return new Response("ignored", { status: 200 });
  }

  const notificationId = payload.record?.id;
  if (typeof notificationId !== "string") {
    return new Response("missing record.id", { status: 400 });
  }

  // 3. Re-fetch from DB — content ALWAYS comes from here, never from webhook body.
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: notification, error: notifErr } = await db
    .from("notifications")
    .select("id, recipient_id, title, body, type, alert_id, report_id, latitude, longitude")
    .eq("id", notificationId)
    .maybeSingle();

  if (notifErr) { console.error("[send-push] DB fetch error:", notifErr.message); return new Response("db error", { status: 500 }); }
  if (!notification) return new Response("notification not found", { status: 200 });

  // 4. Look up recipient push token
  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("expo_push_token")
    .eq("id", notification.recipient_id)
    .maybeSingle();

  if (profileErr) { console.error("[send-push] Profile fetch error:", profileErr.message); return new Response("db error", { status: 500 }); }

  const token = profile?.expo_push_token;
  if (!token?.startsWith("ExponentPushToken")) {
    // In-app notification already written by client — user sees it on next open.
    return new Response("no valid token", { status: 200 });
  }

  // 5. Build and send push — SOS/check-in get "high" priority to break DND
  const isUrgent = notification.type === "sos" || notification.type === "check_in_missed" || String(notification.type).startsWith("sos");
  const message: Record<string, unknown> = {
    to: token,
    sound: "default",
    title: notification.title,
    body: notification.body,
    priority: isUrgent ? "high" : "normal",
    channelId: "default",
    data: {
      type: notification.type,
      ...(notification.alert_id  && { alertId:  notification.alert_id  }),
      ...(notification.report_id && { reportId: notification.report_id }),
      ...(notification.latitude  && { latitude:  notification.latitude  }),
      ...(notification.longitude && { longitude: notification.longitude }),
    },
  };

  const tickets = await sendInBatches([message]);

  // 6. Purge dead tokens from the DB
  await purgeDeadTokens(db, [notification.recipient_id], tickets);

  const sent = tickets.filter((t) => t.status === "ok").length;
  console.log(`[send-push] notification=${notificationId} recipient=${notification.recipient_id} sent=${sent}`);
  return Response.json({ sent });
});
