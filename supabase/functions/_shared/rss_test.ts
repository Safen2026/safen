import { assertEquals } from "jsr:@std/assert@1";
import { parseFeed } from "./rss.ts";

const rss2 = await Deno.readTextFile(
  new URL("./fixtures/rss2-sample.xml", import.meta.url),
);
const atom = await Deno.readTextFile(
  new URL("./fixtures/atom-sample.xml", import.meta.url),
);

Deno.test("parses RSS 2.0 items", () => {
  const items = parseFeed(rss2);
  assertEquals(items.length, 2);
  assertEquals(items[0].title, "Police repel robbery attempt on Allen Avenue, Ikeja");
  assertEquals(items[0].url, "https://example.ng/allen-avenue-robbery/?utm_source=rss");
});

Deno.test("strips HTML from descriptions", () => {
  const items = parseFeed(rss2);
  assertEquals(items[0].summary, "Officers repelled an attack in Ikeja, Lagos State.");
});

Deno.test("normalises pubDate to ISO 8601", () => {
  const items = parseFeed(rss2);
  assertEquals(items[0].publishedAt, "2026-08-27T07:30:00.000Z");
});

Deno.test("a missing pubDate yields null, not a crash and not Date.now()", () => {
  const items = parseFeed(rss2);
  assertEquals(items[1].publishedAt, null);
});

Deno.test("parses Atom entries including href links", () => {
  const items = parseFeed(atom);
  assertEquals(items.length, 1);
  assertEquals(items[0].url, "https://example.ng/kaduna-highway");
  assertEquals(items[0].publishedAt, "2026-08-27T09:15:00.000Z");
});

Deno.test("malformed XML returns an empty array rather than throwing", () => {
  assertEquals(parseFeed("<rss><channel><item>"), []);
});

Deno.test("an item with no link is dropped", () => {
  const xml = `<rss version="2.0"><channel><item><title>No link</title></item></channel></rss>`;
  assertEquals(parseFeed(xml), []);
});
