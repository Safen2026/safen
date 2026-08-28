import { assessQuality, type ClaudeOutcome } from "./claude.ts";
import { prefilter, type CheckInput } from "./prefilter.ts";
import * as db from "./db.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface DecideDeps {
  settings: Record<string, number | string>;
  strikeState: (userId: string) => Promise<{ strike_count: number; banned_until: string | null }>;
  callsToday: (userId: string) => Promise<number>;
  assess: (input: CheckInput) => Promise<ClaudeOutcome>;
  mintToken: (userId: string, input: CheckInput, verdict: string, priority: string | null)
    => Promise<{ token: string; expires_at: string }>;
  recordStrike: (userId: string, reason: string) => Promise<void>;
  logUsage: (row: Record<string, unknown>) => Promise<void>;
}

// deno-lint-ignore no-explicit-any
export interface Decision { status: number; body: any }

/** Pure orchestration — no network, no database. Every branch is unit-tested. */
export async function decide(
  input: CheckInput, userId: string, d: DecideDeps,
): Promise<Decision> {
  const ban = await d.strikeState(userId);
  // Strikes are always RECORDED (they are the signal), but the pause is only
  // ENFORCED in enforcing mode — otherwise flipping quality_gate_mode back to
  // 'advisory' would not restore pre-launch behaviour and users would still be
  // walled out by a mechanism the kill switch does not reach.
  if (ban.banned_until && d.settings.quality_gate_mode === 'enforcing') {
    return { status: 429, body: {
      status: "paused", retry_at: ban.banned_until,
      message: "Too many incomplete reports. Please try again shortly.",
    } };
  }

  const pre = prefilter(input, Number(d.settings.min_description_words));
  if (!pre.ok) {
    await d.recordStrike(userId, "failed_prefilter");
    await d.logUsage({ user_id: userId, function_name: "check-report-quality",
                       model: "none", outcome: "failed_prefilter" });
    const after = await d.strikeState(userId);
    return { status: 200, body: {
      status: "needs_detail", missing: pre.missing, feedback: pre.feedback,
      strikes: { count: after.strike_count, threshold: Number(d.settings.strike_threshold) },
    } };
  }

  // Fail open past the daily ceiling: cap runaway spend, never block a person.
  if (await d.callsToday(userId) >= Number(d.settings.daily_call_ceiling)) {
    const t = await d.mintToken(userId, input, "skipped_quota", null);
    await d.logUsage({ user_id: userId, function_name: "check-report-quality",
                       model: "none", outcome: "skipped_quota" });
    return { status: 200, body: { status: "pass", token: t.token,
      expires_at: t.expires_at, priority: "medium", quality_status: "skipped_quota" } };
  }

  const out = await d.assess(input);
  await d.logUsage({
    user_id: userId, function_name: "check-report-quality", model: "claude-haiku-4-5",
    input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens,
    latency_ms: out.latencyMs,
    outcome: out.degraded ? `degraded:${out.error ?? "unknown"}`.slice(0, 200)
                          : out.verdict!.verdict,
  });

  if (out.degraded || !out.verdict) {
    const t = await d.mintToken(userId, input, "skipped_ai_unavailable", null);
    return { status: 200, body: { status: "pass", token: t.token,
      expires_at: t.expires_at, priority: "medium",
      quality_status: "skipped_ai_unavailable" } };
  }

  if (out.verdict.verdict === "needs_detail") {
    await d.recordStrike(userId, "needs_detail");
    const after = await d.strikeState(userId);
    return { status: 200, body: {
      status: "needs_detail", missing: out.verdict.missing, feedback: out.verdict.feedback,
      strikes: { count: after.strike_count, threshold: Number(d.settings.strike_threshold) },
    } };
  }

  const t = await d.mintToken(userId, input, "passed", out.verdict.priority);
  return { status: 200, body: { status: "pass", token: t.token, expires_at: t.expires_at,
    priority: out.verdict.priority, quality_status: "passed" } };
}

/** HTTP handler. Deno.serve lives in main.ts so importing this module for
 *  tests does not bind a port — two test files sharing a CI process would
 *  otherwise collide on it. */
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const client = db.serviceClient();
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: auth } = await client.auth.getUser(jwt);
    if (!auth?.user) return json({ error: "unauthorized" }, 401);

    const input = (await req.json()) as CheckInput;
    const settings = await db.loadSettings(client);
    if (!settings) return json({ error: "app_settings missing" }, 500);

    const decision = await decide(input, auth.user.id, {
      settings,
      strikeState: (u) => db.strikeState(client, u),
      callsToday: (u) => db.callsToday(client, u),
      assess: (i) => assessQuality(i, Deno.env.get("ANTHROPIC_API_KEY")),
      mintToken: (u, i, v, p) =>
        db.mintToken(client, u, i, v as "passed", p),
      recordStrike: (u, r) => db.recordStrike(client, u, r),
      logUsage: (row) => db.logUsage(client, row),
    });

    return json(decision.body, decision.status);
  } catch (err) {
    // Last-resort fail-open is NOT possible here (no user context), so surface
    // the error; the client's own catch turns it into a degraded pass.
    return json({ error: (err as Error).message }, 500);
  }
};
