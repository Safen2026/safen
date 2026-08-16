import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
// Lives inside this function folder rather than a sibling _shared/ directory:
// the Dashboard's Edge Function bundler only accepts files within the function
// root, and a second copy of this module is not an option — its normalisation
// must stay byte-identical to public.report_payload_fingerprint in the
// database, or every report is rejected as a payload mismatch.
import { fingerprint } from "./fingerprint.ts";
import type { CheckInput } from "./prefilter.ts";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function loadSettings(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("*").limit(1).maybeSingle();
  return data;
}

export async function strikeState(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("strike_state", { p_user: userId });
  const row = Array.isArray(data) ? data[0] : data;
  return { strike_count: row?.strike_count ?? 0, banned_until: row?.banned_until ?? null };
}

export async function callsToday(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.rpc("ai_calls_today", { p_user: userId });
  return typeof data === "number" ? data : 0;
}

export async function recordStrike(db: SupabaseClient, userId: string, reason: string) {
  await db.rpc("record_strike", { p_user: userId, p_reason: reason });
}

export async function logUsage(db: SupabaseClient, row: Record<string, unknown>) {
  await db.from("ai_usage_log").insert(row);
}

export async function mintToken(
  db: SupabaseClient, userId: string, input: CheckInput,
  verdict: "passed" | "skipped_ai_unavailable" | "skipped_quota",
  priority: string | null,
) {
  const token = `sq_${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenSha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();

  const { error } = await db.from("report_quality_tokens").insert({
    user_id: userId,
    token_sha256: tokenSha,
    payload_fingerprint: await fingerprint(input.category, input.description),
    verdict, priority, expires_at: expires,
  });
  if (error) {
    // Returning a token that was never persisted makes the DB gate reject the
    // insert with TOKEN_UNKNOWN and leaves nothing in the logs explaining why.
    console.error("[mintToken] token insert failed:", error.message);
    throw new Error(`token insert failed: ${error.message}`);
  }

  return { token, expires_at: expires };
}
