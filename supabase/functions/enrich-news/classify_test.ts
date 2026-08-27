import { assertEquals } from "jsr:@std/assert@1";
import { type ArticleInput, classify, type ModelClient } from "./classify.ts";

const article: ArticleInput = {
  title: "Robbery on Allen Avenue",
  summary: "Police repelled an attack in Ikeja.",
  sourceName: "Punch",
  publishedAt: "2026-08-27T07:30:00.000Z",
};

const goodJson = JSON.stringify({
  is_security_relevant: true,
  category: "armed_robbery",
  severity: "warning",
  locations: [{ state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" }],
  headline: "Robbery repelled on Allen Avenue",
  summary: "Police repelled an attempted robbery in Ikeja overnight.",
  advice: null,
  confidence: 0.88,
});

const client = (
  r: Partial<{ stop_reason: string; text: string }> | Error,
): ModelClient => ({
  create: () =>
    r instanceof Error ? Promise.reject(r) : Promise.resolve({
      stop_reason: r.stop_reason ?? "end_turn",
      text: r.text ?? null,
    }),
});

Deno.test("parses a well-formed verdict", async () => {
  const res = await classify(article, client({ text: goodJson }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.verdict.severity, "warning");
    assertEquals(res.verdict.locations[0].lga, "Ikeja");
  }
});

Deno.test("a refusal is reported as refusal, never as a crash", async () => {
  const res = await classify(article, client({ stop_reason: "refusal", text: undefined }));
  assertEquals(res, { ok: false, failure: "refusal" });
});

Deno.test("refusal is detected before content is read", async () => {
  const res = await classify(article, client({ stop_reason: "refusal", text: goodJson }));
  assertEquals(res, { ok: false, failure: "refusal" });
});

Deno.test("a network error is transport, not malformed", async () => {
  const res = await classify(article, client(new Error("ECONNRESET")));
  assertEquals(res, { ok: false, failure: "transport" });
});

Deno.test("a timeout is transport", async () => {
  const res = await classify(article, client(new DOMException("aborted", "AbortError")));
  assertEquals(res, { ok: false, failure: "transport" });
});

Deno.test("non-JSON text is malformed", async () => {
  const res = await classify(article, client({ text: "I cannot help with that." }));
  assertEquals(res, { ok: false, failure: "malformed" });
});

Deno.test("missing text block is malformed", async () => {
  const res = await classify(article, client({ text: undefined }));
  assertEquals(res, { ok: false, failure: "malformed" });
});

Deno.test("JSON missing a required field is invalid", async () => {
  const res = await classify(article, client({ text: JSON.stringify({ severity: "warning" }) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("an out-of-range confidence is invalid", async () => {
  const bad = JSON.parse(goodJson);
  bad.confidence = 1.7;
  const res = await classify(article, client({ text: JSON.stringify(bad) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("an unknown severity is invalid", async () => {
  const bad = JSON.parse(goodJson);
  bad.severity = "apocalyptic";
  const res = await classify(article, client({ text: JSON.stringify(bad) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("classify never throws, whatever the client does", async () => {
  const hostile: ModelClient = {
    create: () => {
      throw new Error("sync throw");
    },
  };
  const res = await classify(article, hostile);
  assertEquals(res.ok, false);
});
