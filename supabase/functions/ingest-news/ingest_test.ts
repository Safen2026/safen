import { assertEquals } from "jsr:@std/assert@1";
import { ingestAll, type IngestDeps, type SourceRow } from "./ingest.ts";

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Robbery in Ikeja</title><link>https://a.ng/one</link>
<description>Details</description><pubDate>Wed, 27 Aug 2026 08:30:00 +0100</pubDate></item>
</channel></rss>`;

// deno-lint-ignore no-explicit-any
function deps(over: Partial<IngestDeps> = {}): any {
  // deno-lint-ignore no-explicit-any
  const inserted: any[] = [];
  const failures: string[] = [];
  const base: IngestDeps = {
    listSources: () =>
      Promise.resolve([
        { id: "s1", name: "A", rss_url: "https://a.ng/feed", consecutive_failures: 0 },
        { id: "s2", name: "B", rss_url: "https://b.ng/feed", consecutive_failures: 0 },
      ] as SourceRow[]),
    fetchText: () => Promise.resolve(FEED),
    insertRaw: (rows) => {
      inserted.push(...rows);
      return Promise.resolve(rows.length);
    },
    markSuccess: () => Promise.resolve(),
    markFailure: (id) => {
      failures.push(id);
      return Promise.resolve();
    },
  };
  return Object.assign({}, base, over, { inserted, failures });
}

Deno.test("ingests items from every enabled source", async () => {
  const d = deps();
  const r = await ingestAll(d);
  assertEquals(r.inserted, 2);
  assertEquals(d.inserted[0].url_hash.length, 64);
  assertEquals(d.inserted[0].source_id, "s1");
});

Deno.test("one failing source does not stop the others", async () => {
  const d = deps({
    fetchText: (url: string) =>
      url.includes("a.ng") ? Promise.reject(new Error("boom")) : Promise.resolve(FEED),
  });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 1);
  assertEquals(r.failed, ["s1"]);
  assertEquals(d.failures, ["s1"]);
});

Deno.test("published_at survives as ISO", async () => {
  const d = deps();
  await ingestAll(d);
  assertEquals(d.inserted[0].published_at, "2026-08-27T07:30:00.000Z");
});

Deno.test("an empty feed is a success, not a failure", async () => {
  const d = deps({ fetchText: () => Promise.resolve("<rss><channel></channel></rss>") });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 0);
  assertEquals(r.failed, []);
});

Deno.test("insert errors are contained per source", async () => {
  const d = deps({ insertRaw: () => Promise.reject(new Error("db down")) });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 0);
  assertEquals(r.failed.length, 2);
});
