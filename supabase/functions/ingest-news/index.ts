import { createClient } from "@supabase/supabase-js";
import {
  ingestAll,
  type IngestDeps,
  MAX_CONSECUTIVE_FAILURES,
  type SourceRow,
} from "./ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FETCH_TIMEOUT_MS = 10_000;

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const deps: IngestDeps = {
    async listSources() {
      const { data, error } = await db
        .from("news_sources")
        .select("id, name, rss_url, consecutive_failures")
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },

    async fetchText(url) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "user-agent": "SafenBot/1.0 (+https://safen.ng)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    },

    async insertRaw(rows) {
      // ignoreDuplicates leans on the url_hash unique index: re-running a tick
      // is a no-op rather than an error, which keeps ingestion idempotent.
      const { data, error } = await db
        .from("news_items_raw")
        .upsert(rows, { onConflict: "url_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async markSuccess(sourceId) {
      await db.from("news_sources")
        .update({ last_fetched_at: new Date().toISOString(), consecutive_failures: 0 })
        .eq("id", sourceId);
    },

    async markFailure(sourceId, err, failuresSoFar) {
      const next = failuresSoFar + 1;
      await db.from("news_sources")
        .update({
          consecutive_failures: next,
          enabled: next < MAX_CONSECUTIVE_FAILURES,
        })
        .eq("id", sourceId);
      console.error(`ingest-news: source ${sourceId} failed (${next}): ${err}`);
    },
  };

  try {
    const result = await ingestAll(deps);
    console.log(`ingest-news: inserted=${result.inserted} failed=${result.failed.length}`);
    return Response.json(result);
  } catch (err) {
    console.error("ingest-news fatal:", err);
    return new Response("ingest failed", { status: 500 });
  }
});
