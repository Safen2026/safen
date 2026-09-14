import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertSafeFeedUrl,
  ingestAll,
  type IngestDeps,
  readCapped,
  type SourceRow,
} from "./ingest.ts";

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

Deno.test("real seeded feed urls pass validation", () => {
  for (const url of [
    "https://punchng.com/feed/",
    "https://www.vanguardngr.com/feed/",
    "https://www.premiumtimesng.com/feed",
    "https://dailypost.ng/feed/",
  ]) {
    assertSafeFeedUrl(url);
  }
});

Deno.test("internal and non-https feed urls are refused", () => {
  for (const url of [
    "http://punchng.com/feed/",
    "file:///etc/passwd",
    "https://localhost/feed",
    "https://api.localhost/feed",
    "https://127.0.0.1/feed",
    "https://2130706433/feed",
    "https://0x7f.1/feed",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/feed",
    "https://[::1]/feed",
    "https://[::ffff:127.0.0.1]/feed",
    "https://kong/feed",
    "https://db.internal/feed",
    "https://printer.local/feed",
    "https://user:pw@punchng.com/feed",
    "https://punchng.com:8443/feed",
    "not a url",
  ]) {
    assertThrows(() => assertSafeFeedUrl(url), Error, undefined, url);
  }
});

Deno.test("readCapped returns a body under the cap", async () => {
  const text = await readCapped(new Response(FEED), 1024 * 1024);
  assertEquals(text, FEED);
});

Deno.test("readCapped refuses a declared oversize body up front", async () => {
  const res = new Response("x", { headers: { "content-length": "999999999" } });
  await assertRejects(() => readCapped(res, 1024), Error, "too large");
});

Deno.test("readCapped aborts a streamed body with no content-length", async () => {
  let pulls = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      pulls++;
      ctrl.enqueue(new Uint8Array(512));
    },
  });
  await assertRejects(() => readCapped(new Response(endless), 4096), Error, "too large");
  assertEquals(pulls < 20, true);
});
