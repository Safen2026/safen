import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { canonicalizeUrl, urlHash } from "./url.ts";

Deno.test("lowercases host and strips www", () => {
  assertEquals(
    canonicalizeUrl("https://WWW.Punchng.com/story-a"),
    "https://punchng.com/story-a",
  );
});

Deno.test("strips query string, fragment and trailing slash", () => {
  assertEquals(
    canonicalizeUrl("https://punchng.com/story-a/?utm_source=rss#top"),
    "https://punchng.com/story-a",
  );
});

Deno.test("preserves path case (Nigerian slugs are case-sensitive on some CMSes)", () => {
  assertEquals(
    canonicalizeUrl("https://punchng.com/Ikeja-Robbery"),
    "https://punchng.com/Ikeja-Robbery",
  );
});

Deno.test("same story from two URLs hashes identically", async () => {
  const a = await urlHash("https://www.punchng.com/story-a/?utm_medium=feed");
  const b = await urlHash("https://punchng.com/story-a");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("different stories hash differently", async () => {
  assertNotEquals(
    await urlHash("https://punchng.com/story-a"),
    await urlHash("https://punchng.com/story-b"),
  );
});

Deno.test("a malformed URL falls back to the trimmed raw string, never throws", () => {
  assertEquals(canonicalizeUrl("  not a url  "), "not a url");
});
