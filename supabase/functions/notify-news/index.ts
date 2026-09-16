// Triggered by a Database Webhook on INSERT into public.news_items.
// Mirrors the shape of the existing send-feedback function.
import { createClient } from "@supabase/supabase-js";
import { secretMatches, WEBHOOK_SECRET_HEADER } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NEWS_WEBHOOK_SECRET = Deno.env.get("NEWS_WEBHOOK_SECRET");

const PUSHWORTHY = new Set(["critical", "warning"]);

Deno.serve(async (req) => {
  // verify_jwt is off (the webhook sends no user JWT), so this is the only
  // thing standing between the public URL and a push to every user in an LGA.
  if (!(await secretMatches(req.headers.get(WEBHOOK_SECRET_HEADER), NEWS_WEBHOOK_SECRET))) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const id = payload?.record?.id;
    if (typeof id !== "string") return new Response("no record", { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Push what the database holds, never what the request body claims. Even
    // with the secret leaked, a caller can then only re-announce a real item,
    // and claim_news_push already caps that per user.
    const { data: item, error: itemErr } = await db
      .from("news_items")
      .select("id, headline, summary, severity, lga_code")
      .eq("id", id)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) return new Response("unknown item", { status: 404 });

    // Feed-only unless it is both severe AND locatable to an LGA. Everything
    // else stays in the feed rather than competing with SOS for attention.
    if (!PUSHWORTHY.has(item.severity) || !item.lga_code) {
      return new Response("not pushworthy", { status: 200 });
    }

    // last_lga_code is written by the client in useSafetyFeed's resolveArea.
    // A user whose area never resolved stays null and is correctly excluded —
    // never fall back to notifying everyone.
    const { data: recipients, error } = await db
      .from("profiles")
      .select("id, expo_push_token")
      .eq("last_lga_code", item.lga_code)
      .not("expo_push_token", "is", null);

    if (error) throw error;

    const messages: Record<string, unknown>[] = [];
    for (const r of recipients ?? []) {
      // Same token-shape guard the rest of src/lib/notifications.ts applies.
      if (!r.expo_push_token?.startsWith("ExponentPushToken")) continue;

      // Claim BEFORE queueing: the cap is reserved atomically, so two
      // concurrent invocations cannot both slip past the count check.
      const { data: claimed } = await db.rpc("claim_news_push", {
        p_user_id: r.id,
        p_news_id: item.id,
      });
      if (claimed !== true) continue;

      messages.push({
        to: r.expo_push_token,
        sound: "default",
        title: item.headline,
        body: item.summary,
        data: { type: "news_alert", route: "/feed", newsId: item.id },
      });
    }

    if (messages.length === 0) return new Response("no recipients", { status: 200 });

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) console.error("expo push failed:", await res.text());

    return Response.json({ sent: messages.length });
  } catch (err) {
    console.error("notify-news error:", err);
    return new Response("error", { status: 500 });
  }
});
