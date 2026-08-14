import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { fingerprint, normalise } from "./fingerprint.ts";

Deno.test("normalise collapses every whitespace char we support", () => {
  assertEquals(normalise("  a \t b \n c \r\n d  "), "a b c d");
});

Deno.test("normalise lowercases", () => {
  assertEquals(normalise("Allen AVENUE"), "allen avenue");
});

Deno.test("fingerprint is stable across whitespace and casing", async () => {
  const a = await fingerprint("security", "Man  took   my  BAG");
  const b = await fingerprint("  SECURITY ", "man took my bag");
  assertEquals(a, b);
});

Deno.test("fingerprint changes when meaning changes", async () => {
  const a = await fingerprint("security", "man took my bag");
  const b = await fingerprint("security", "man took my car");
  assertEquals(a === b, false);
});

Deno.test("fingerprint is 64 lowercase hex chars", async () => {
  assertMatch(await fingerprint("fire", "smoke on allen avenue"), /^[0-9a-f]{64}$/);
});

Deno.test("a non-breaking space is NOT treated as whitespace", () => {
  // Postgres btrim() strips only ASCII space, so JS must not strip U+00A0
  // either, or the two fingerprints diverge on text pasted from Word/WhatsApp.
  const nbsp = "\u00A0";
  assertEquals(normalise(`${nbsp}hello${nbsp}`), `${nbsp}hello${nbsp}`);
});
