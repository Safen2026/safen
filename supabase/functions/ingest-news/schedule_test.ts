import { assert, assertEquals } from "jsr:@std/assert@1";
import { INGEST_INTERVAL_MINUTES } from "./ingest.ts";

// The live schedule is whatever the newest migration that schedules
// 'news-ingest' says, so read it from there rather than trusting a constant.
const MIGRATIONS = new URL("../../migrations/", import.meta.url);

async function latestIngestSchedule(): Promise<string> {
  const names: string[] = [];
  for await (const e of Deno.readDir(MIGRATIONS)) {
    if (e.isFile && e.name.endsWith(".sql")) names.push(e.name);
  }
  names.sort();

  let schedule: string | null = null;
  for (const name of names) {
    const sql = await Deno.readTextFile(new URL(name, MIGRATIONS));
    const m = sql.match(/cron\.schedule\(\s*'news-ingest[^']*',\s*'([^']+)'/);
    if (m) schedule = m[1];
  }
  if (!schedule) throw new Error("no migration schedules news-ingest");
  return schedule;
}

/** Minutes between runs for "*\/N * * * *", "M *\/N * * *", "M * * * *"
 *  and daily "M H * * *" — the only shapes this pipeline has used. */
function intervalMinutes(cron: string): number {
  const [min, hour, dom, mon, dow] = cron.split(/\s+/);
  assertEquals([dom, mon, dow], ["*", "*", "*"], `unsupported cron: ${cron}`);
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === "*") return Number(everyMin[1]);
  const everyHour = hour.match(/^\*\/(\d+)$/);
  if (/^\d+$/.test(min) && everyHour) return Number(everyHour[1]) * 60;
  if (/^\d+$/.test(min) && hour === "*") return 60;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return 24 * 60;
  throw new Error(`unsupported cron: ${cron}`);
}

Deno.test("news is ingested at least every 12 hours", async () => {
  const minutes = intervalMinutes(await latestIngestSchedule());
  assert(minutes <= 12 * 60, `ingest runs every ${minutes} min`);
});

Deno.test("ingest polls faster than the shortest observed feed window", async () => {
  // Measured 2026-09-30: Daily Post's RSS spans only ~1.4h of articles, so any
  // slower poll silently drops stories that scroll off between runs.
  const minutes = intervalMinutes(await latestIngestSchedule());
  assert(minutes < 84, `ingest runs every ${minutes} min`);
});

Deno.test("the failure threshold is computed from the live schedule", async () => {
  assertEquals(intervalMinutes(await latestIngestSchedule()), INGEST_INTERVAL_MINUTES);
});
