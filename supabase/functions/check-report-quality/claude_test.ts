import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assessQuality, buildUserMessage, parseVerdict, VERDICT_SCHEMA,
} from "./claude.ts";
import type { CheckInput } from "./prefilter.ts";

const input: CheckInput = {
  category: "security", description: "Two men snatched a bag near the junction",
  latitude: 6.6, longitude: 3.35, has_media: true, address: "Allen Avenue",
};

Deno.test("the JSON schema forbids extra properties", () => {
  assertEquals((VERDICT_SCHEMA as { additionalProperties: boolean }).additionalProperties, false);
});

Deno.test("the user message carries every field the rubric needs", () => {
  const msg = buildUserMessage(input);
  assert(msg.includes("security"));
  assert(msg.includes("Allen Avenue"));
  assert(msg.includes("Two men snatched"));
});

Deno.test("parseVerdict accepts a well-formed response", () => {
  const v = parseVerdict(JSON.stringify({
    verdict: "needs_detail", missing: ["time"], feedback: "What time?",
    priority: "high", priority_reason: "ongoing",
  }));
  assertEquals(v.verdict, "needs_detail");
  assertEquals(v.priority, "high");
});

Deno.test("parseVerdict rejects an unknown priority", () => {
  assertThrows(() => parseVerdict(JSON.stringify({
    verdict: "pass", missing: [], feedback: "", priority: "urgent", priority_reason: "",
  })));
});

Deno.test("parseVerdict rejects non-JSON", () => {
  assertThrows(() => parseVerdict("Sure! Here is the JSON: {"));
});

Deno.test("a missing API key fails open rather than throwing", async () => {
  const out = await assessQuality(input, undefined);
  assertEquals(out.degraded, true);
  assertEquals(out.verdict, null);
  assert((out.error ?? "").length > 0);
});
