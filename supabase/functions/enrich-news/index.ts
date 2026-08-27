import { createClient } from "@supabase/supabase-js";
import { classify, makeAnthropicClient } from "./classify.ts";
import { evaluateGate } from "./gate.ts";
import { type GazetteerTables, resolveLocations } from "../_shared/gazetteer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const BATCH_SIZE = 40;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;

Deno.serve(async () => {
  if (!ANTHROPIC_API_KEY) {
    console.error("enrich-news: ANTHROPIC_API_KEY not configured");
    return new Response("not configured", { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const model = makeAnthropicClient(ANTHROPIC_API_KEY);

  const [statesRes, lgasRes, aliasRes] = await Promise.all([
    db.from("ng_states").select("code, name"),
    db.from("ng_lgas").select("code, state_code, name"),
    db.from("ng_place_aliases").select("alias_norm, state_code, lga_code"),
  ]);
  const tables: GazetteerTables = {
    states: statesRes.data ?? [],
    lgas: lgasRes.data ?? [],
    aliases: aliasRes.data ?? [],
  };

  const { data: pending, error } = await db
    .from("news_items_raw")
    .select("id, url, title, raw_summary, published_at, fetched_at, attempts, source_id")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("fetched_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("enrich-news: queue read failed", error);
    return new Response("queue read failed", { status: 500 });
  }

  const sourceNames = new Map<string, string>();
  const { data: sources } = await db.from("news_sources").select("id, name");
  for (const s of sources ?? []) sourceNames.set(s.id, s.name);

  const stats = { published: 0, rejected: 0, failed: 0 };

  // deno-lint-ignore no-explicit-any
  async function handle(row: any) {
    const sourceName = sourceNames.get(row.source_id) ?? "Unknown";

    const result = await classify({
      title: row.title,
      summary: row.raw_summary,
      sourceName,
      publishedAt: row.published_at,
    }, model);

    if (!result.ok) {
      // A refusal is terminal — retrying identical content just burns budget.
      if (result.failure === "refusal") {
        stats.rejected++;
        await db.from("news_items_raw")
          .update({ status: "rejected", last_error: "refusal" })
          .eq("id", row.id);
        return;
      }
      const attempts = (row.attempts ?? 0) + 1;
      stats.failed++;
      await db.from("news_items_raw")
        .update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: result.failure,
        })
        .eq("id", row.id);
      return;
    }

    const resolved = resolveLocations(result.verdict.locations, tables);
    const gate = evaluateGate(result.verdict, resolved);

    if (!gate.publish) {
      stats.rejected++;
      await db.from("news_items_raw")
        .update({ status: "rejected", last_error: gate.reason })
        .eq("id", row.id);
      return;
    }

    const primary = resolved[0];
    const { error: insErr } = await db.from("news_items").insert({
      raw_id: row.id,
      headline: result.verdict.headline,
      summary: result.verdict.summary,
      advice: result.verdict.advice,
      category: result.verdict.category,
      severity: result.verdict.severity,
      confidence: result.verdict.confidence,
      state_code: primary.state_code,
      lga_code: primary.lga_code,
      is_national: resolved.length > 2,
      published_at: row.published_at ?? row.fetched_at,
      source_name: sourceName,
      source_url: row.url,
    });

    if (insErr) {
      // Do not mark enriched on a write failure — the row must remain claimable.
      const attempts = (row.attempts ?? 0) + 1;
      stats.failed++;
      await db.from("news_items_raw")
        .update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: `insert: ${insErr.message}`,
        })
        .eq("id", row.id);
      return;
    }

    stats.published++;
    await db.from("news_items_raw").update({ status: "enriched" }).eq("id", row.id);
  }

  const queue = [...(pending ?? [])];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (row) await handle(row);
    }
  });
  await Promise.all(workers);

  console.log(`enrich-news: ${JSON.stringify(stats)}`);
  return Response.json(stats);
});
