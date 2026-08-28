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

// ---------------------------------------------------------------------------
// Wire-shape and response-path coverage.
//
// These exist because `output_config` was previously smuggled past the type
// checker with `as never`. Types now cover the request, but a future SDK could
// still rename or restructure the field without a compile error on OUR side —
// these assert on the bytes actually sent, which is the layer that would break.
// ---------------------------------------------------------------------------

function stubFetch(handler: (body: Record<string, unknown>) => Response) {
  const real = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push(body);
    return Promise.resolve(handler(body));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

function messageResponse(fields: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
      content: [],
      ...fields,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const okVerdict = JSON.stringify({
  verdict: "needs_detail", missing: ["time"], feedback: "What time did it happen?",
  priority: "high", priority_reason: "recent and violent",
});

Deno.test("the request puts the schema under output_config.format on the wire", async () => {
  const { calls, restore } = stubFetch(() =>
    messageResponse({ content: [{ type: "text", text: okVerdict }] }));
  try {
    await assessQuality(input, "test-key");
  } finally {
    restore();
  }

  assertEquals(calls.length, 1);
  const format = (calls[0].output_config as { format?: Record<string, unknown> })?.format;
  assert(format, "output_config.format missing from the request body");
  assertEquals(format.type, "json_schema");
  assertEquals(format.schema, VERDICT_SCHEMA);
  // Guard the deprecated top-level spelling from creeping back in.
  assertEquals(calls[0].output_format, undefined);
});

Deno.test("a well-formed response is parsed and its usage reported", async () => {
  const { restore } = stubFetch(() =>
    messageResponse({
      content: [{ type: "text", text: okVerdict }],
      usage: { input_tokens: 412, output_tokens: 57 },
    }));
  let out;
  try {
    out = await assessQuality(input, "test-key");
  } finally {
    restore();
  }

  assertEquals(out.degraded, false);
  assertEquals(out.verdict?.verdict, "needs_detail");
  assertEquals(out.verdict?.priority, "high");
  assertEquals(out.usage, { input_tokens: 412, output_tokens: 57 });
});

Deno.test("a refusal fails open rather than parsing empty content", async () => {
  const { restore } = stubFetch(() =>
    messageResponse({ stop_reason: "refusal", content: [] }));
  let out;
  try {
    out = await assessQuality(input, "test-key");
  } finally {
    restore();
  }

  assertEquals(out.degraded, true);
  assertEquals(out.verdict, null);
  assertEquals(out.error, "model refused");
});

Deno.test("thinking blocks before the text block do not break parsing", async () => {
  const { restore } = stubFetch(() =>
    messageResponse({
      content: [
        { type: "thinking", thinking: "weighing it up", signature: "sig" },
        { type: "text", text: okVerdict },
      ],
    }));
  let out;
  try {
    out = await assessQuality(input, "test-key");
  } finally {
    restore();
  }

  assertEquals(out.degraded, false);
  assertEquals(out.verdict?.feedback, "What time did it happen?");
});

// ---------------------------------------------------------------------------
// Finding I7: assessQuality's transport failure paths were previously verified
// by reading only. These exercise them against the real SDK, so a future change
// that lets one of them throw fails the suite instead of failing a user's
// emergency report.
// ---------------------------------------------------------------------------

/** Like stubFetch, but the caller controls the promise so rejections can be modelled. */
function stubFetchRaw(handler: () => Promise<Response>) {
  const real = globalThis.fetch;
  globalThis.fetch = (() => handler()) as typeof fetch;
  return { restore: () => { globalThis.fetch = real; } };
}

function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("a network failure fails open rather than throwing", async () => {
  const { restore } = stubFetchRaw(() => Promise.reject(new TypeError("network error")));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
    assert(out.error, "a degraded outcome should carry an error string");
  } finally {
    restore();
  }
});

Deno.test("a request timeout fails open", async () => {
  const { restore } = stubFetchRaw(() =>
    Promise.reject(new DOMException("The signal has been aborted", "AbortError")));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
  } finally {
    restore();
  }
});

Deno.test("an HTTP 500 fails open", async () => {
  const { restore } = stubFetchRaw(() =>
    Promise.resolve(errorResponse(500, { type: "error", error: { type: "api_error", message: "boom" } })));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
  } finally {
    restore();
  }
});

Deno.test("an exhausted credit balance fails open rather than blocking reports", async () => {
  // Observed in the wild: a 400 invalid_request_error, not a 401. A reporter
  // must never be blocked because the Anthropic account is out of credit.
  const { restore } = stubFetchRaw(() =>
    Promise.resolve(errorResponse(400, {
      type: "error",
      error: { type: "invalid_request_error", message: "Your credit balance is too low" },
    })));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
  } finally {
    restore();
  }
});

Deno.test("a response with no text block fails open", async () => {
  const { restore } = stubFetch(() => messageResponse({ content: [] }));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
  } finally {
    restore();
  }
});

Deno.test("malformed JSON in the text block fails open", async () => {
  const { restore } = stubFetch(() =>
    messageResponse({ content: [{ type: "text", text: "I cannot help with that." }] }));
  try {
    const out = await assessQuality(input, "test-key");
    assertEquals(out.degraded, true);
    assertEquals(out.verdict, null);
  } finally {
    restore();
  }
});
