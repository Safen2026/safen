import { assert, assertEquals } from "jsr:@std/assert@1";
import { prefilter, wordCount, type CheckInput } from "./prefilter.ts";

const base: CheckInput = {
  category: "security",
  description: "Two men on a motorcycle snatched a bag near the junction and rode north",
  latitude: 6.6, longitude: 3.35, has_media: true,
};

Deno.test("wordCount ignores extra whitespace", () => {
  assertEquals(wordCount("  one   two \n three "), 3);
});

Deno.test("a detailed report passes", () => {
  // base.description is 14 words, so it clears a threshold of 5.
  assertEquals(prefilter(base, 5).ok, true);
  assertEquals(prefilter(base, 5).missing, []);
});

Deno.test("the word threshold is respected", () => {
  // ...and fails one of 20.
  assertEquals(prefilter(base, 20).ok, false);
});

Deno.test("a two-word report is rejected without calling the model", () => {
  const r = prefilter({ ...base, description: "robbery" }, 15);
  assertEquals(r.ok, false);
  assert(r.missing.includes("description"));
  assert(r.feedback.length > 0);
});

Deno.test("missing_person requires all four fields", () => {
  const r = prefilter({ ...base, category: "missing_person", has_media: false }, 5);
  assertEquals(r.ok, false);
  assert(r.missing.includes("photo"));
  assert(r.missing.includes("last_seen_at"));
  assert(r.missing.includes("police_reference"));
});

Deno.test("missing_person with all four passes the prefilter", () => {
  const r = prefilter({
    ...base, category: "missing_person", has_media: true,
    last_seen_at: "2026-08-11T19:30:00Z", police_reference: "Ikeja/CR/1123",
  }, 5);
  assertEquals(r.ok, true);
  assertEquals(r.missing, []);
});

Deno.test("a report with no coordinates flags location", () => {
  const r = prefilter({ ...base, latitude: null, longitude: null }, 5);
  assertEquals(r.ok, false);
  assert(r.missing.includes("location"));
});
