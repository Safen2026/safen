// Triggered by a Database Webhook on INSERT into public.news_items.
// Mirrors the shape of the existing send-feedback function.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PUSHWORTHY = new Set(["critical", "warning"]);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const item = payload.record;
    if (!item) return new Response("no record", { status: 400 });

    // Feed-only unless it is both severe AND locatable to an LGA. Everything
    // else stays in the feed rather than competing with SOS for attention.
    if (!PUSHWORTHY.has(item.severity) || !item.lga_code) {
      return new Response("not pushworthy", { status: 200 });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
