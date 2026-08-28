import { assert, assertEquals } from "jsr:@std/assert@1";
import { decide, type DecideDeps } from "./index.ts";
import type { CheckInput } from "./prefilter.ts";

const input: CheckInput = {
  category: "security",
  description: "Two men on a motorcycle snatched a bag near the junction and rode north",
  latitude: 6.6, longitude: 3.35, has_media: true,
};

const settings = {
  quality_gate_mode: "advisory", strike_threshold: 3, strike_window_minutes: 15,
  ban_minutes: 30, daily_call_ceiling: 40, min_description_words: 5,
  dupe_radius_meters: 500, dupe_window_minutes: 60, cluster_confirm_count: 5,
};

function deps(over: Partial<DecideDeps> = {}): DecideDeps {
  return {
    settings,
    strikeState: () => Promise.resolve({ strike_count: 0, banned_until: null }),
    callsToday: () => Promise.resolve(0),
    assess: () => Promise.resolve({
      verdict: { verdict: "pass", missing: [], feedback: "", priority: "high", priority_reason: "x" },
      degraded: false, usage: { input_tokens: 10, output_tokens: 5 }, latencyMs: 12,
    }),
    mintToken: () => Promise.resolve({ token: "tok_x", expires_at: "2026-08-12T18:00:00Z" }),
    recordStrike: () => Promise.resolve(),
    logUsage: () => Promise.resolve(),
    ...over,
  };
}

Deno.test("a banned user is paused and no model call is made", async () => {
  let called = false;
  const out = await decide(input, "user-1", deps({
    settings: { ...settings, quality_gate_mode: "enforcing" },
    strikeState: () => Promise.resolve({
      strike_count: 3, banned_until: "2026-08-12T18:05:00Z",
    }),
    assess: () => { called = true; throw new Error("must not be called"); },
  }));
  assertEquals(out.status, 429);
  assertEquals(out.body.status, "paused");
  assertEquals(called, false);
});

Deno.test("a banned user is NOT paused while the gate is advisory", async () => {
  const out = await decide(input, "user-1", deps({
    strikeState: () => Promise.resolve({
      strike_count: 3, banned_until: "2026-08-12T18:05:00Z",
    }),
  }));
  assertEquals(out.status, 200);
  assertEquals(out.body.status, "pass");
});

Deno.test("the pre-filter rejects without a model call and records a strike", async () => {
  let assessed = false, struck = false;
  const out = await decide({ ...input, description: "robbery" }, "user-1", deps({
    assess: () => { assessed = true; throw new Error("must not be called"); },
    recordStrike: () => { struck = true; return Promise.resolve(); },
  }));
  assertEquals(out.body.status, "needs_detail");
  assertEquals(assessed, false);
  assertEquals(struck, true);
});

Deno.test("a pass mints a token and returns the priority", async () => {
  const out = await decide(input, "user-1", deps());
  assertEquals(out.status, 200);
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.token, "tok_x");
  assertEquals(out.body.priority, "high");
  assertEquals(out.body.quality_status, "passed");
});

Deno.test("needs_detail returns feedback, no token, and a strike", async () => {
  let struck = false;
  const out = await decide(input, "user-1", deps({
    assess: () => Promise.resolve({
      verdict: { verdict: "needs_detail", missing: ["time"], feedback: "What time?",
                 priority: "medium", priority_reason: "" },
      degraded: false, usage: { input_tokens: 10, output_tokens: 5 }, latencyMs: 9,
    }),
    recordStrike: () => { struck = true; return Promise.resolve(); },
  }));
  assertEquals(out.body.status, "needs_detail");
  assertEquals(out.body.feedback, "What time?");
  assert(out.body.token === undefined);
  assertEquals(struck, true);
});

Deno.test("a degraded model call fails OPEN with a token", async () => {
  const out = await decide(input, "user-1", deps({
    assess: () => Promise.resolve({
      verdict: null, degraded: true, error: "timeout",
      usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: 8000,
    }),
  }));
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.quality_status, "skipped_ai_unavailable");
  assertEquals(out.body.token, "tok_x");
});

Deno.test("over the daily ceiling fails OPEN without a model call", async () => {
  let assessed = false;
  const out = await decide(input, "user-1", deps({
    callsToday: () => Promise.resolve(40),
    assess: () => { assessed = true; throw new Error("must not be called"); },
  }));
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.quality_status, "skipped_quota");
  assertEquals(assessed, false);
});
