import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import type { CheckInput } from "./prefilter.ts";

const MODEL = "claude-haiku-4-5";
const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export interface Verdict {
  verdict: "pass" | "needs_detail";
  missing: string[];
  feedback: string;
  priority: (typeof PRIORITIES)[number];
  priority_reason: string;
}

export interface ClaudeOutcome {
  verdict: Verdict | null;
  degraded: boolean;
  error?: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}

export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "missing", "feedback", "priority", "priority_reason"],
  properties: {
    verdict: { type: "string", enum: ["pass", "needs_detail"] },
    missing: {
      type: "array",
      items: {
        type: "string",
        enum: ["location", "time", "description", "evidence", "suspect", "direction"],
      },
    },
    feedback: { type: "string" },
    priority: { type: "string", enum: PRIORITIES },
    priority_reason: { type: "string" },
  },
} as const;

const RUBRIC = `You review incident reports for a Nigerian personal-safety app before they reach responders.

Decide whether a report carries enough ACTIONABLE detail: what happened, where, when, and who or what was involved.

Rules:
- "pass" when a responder could act on it. Do not demand perfect prose. People write these under stress, often on a phone, often in a hurry.
- "needs_detail" only when something genuinely actionable is absent.
- feedback must be ONE short question, under 140 characters, in plain warm English. Ask for the single most useful missing thing. Never scold.
- Assign priority by danger to life: critical = happening now with injury or a weapon; high = recent and violent; medium = property or past events; low = minor or advisory.
- Never invent details that are not in the report.`;

export function buildUserMessage(input: CheckInput): string {
  return [
    `Category: ${input.category}`,
    `Address: ${input.address ?? "(not supplied)"}`,
    `Coordinates: ${input.latitude ?? "?"}, ${input.longitude ?? "?"}`,
    `Media attached: ${input.has_media ? "yes" : "no"}`,
    input.last_seen_at ? `Last seen: ${input.last_seen_at}` : null,
    input.police_reference ? `Police reference: ${input.police_reference}` : null,
    "",
    "Report:",
    input.description,
  ].filter((l) => l !== null).join("\n");
}

export function parseVerdict(raw: string): Verdict {
  const v = JSON.parse(raw) as Verdict;
  if (v.verdict !== "pass" && v.verdict !== "needs_detail") {
    throw new Error(`unknown verdict: ${v.verdict}`);
  }
  if (!PRIORITIES.includes(v.priority)) {
    throw new Error(`unknown priority: ${v.priority}`);
  }
  return {
    ...v,
    missing: Array.isArray(v.missing) ? v.missing : [],
    feedback: String(v.feedback ?? "").slice(0, 140),
  };
}

/**
 * Never throws. Every failure path returns degraded=true so the caller fails
 * open — a broken dependency must not stand between someone and reporting an
 * emergency.
 *
 * Model notes (claude-haiku-4-5):
 *   - output_config.effort is NOT supported and errors. Do not add it.
 *   - thinking is omitted deliberately: this model does not think when omitted.
 *   - no cache_control: the minimum cacheable prefix is 4096 tokens and the
 *     rubric is far shorter, so it would silently never engage.
 */
export async function assessQuality(
  input: CheckInput,
  apiKey: string | undefined,
): Promise<ClaudeOutcome> {
  const started = Date.now();
  const empty = { input_tokens: 0, output_tokens: 0 };

  if (!apiKey) {
    return { verdict: null, degraded: true, error: "ANTHROPIC_API_KEY is not set",
             usage: empty, latencyMs: Date.now() - started };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 8_000, maxRetries: 1 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: RUBRIC,
      messages: [{ role: "user", content: buildUserMessage(input) }],
      output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
    } as never);

    const message = res as unknown as {
      stop_reason?: string;
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const usage = {
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    };

    if (message.stop_reason === "refusal") {
      return { verdict: null, degraded: true, error: "model refused",
               usage, latencyMs: Date.now() - started };
    }

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return { verdict: parseVerdict(text), degraded: false, usage,
             latencyMs: Date.now() - started };
  } catch (err) {
    return { verdict: null, degraded: true, error: (err as Error).message,
             usage: empty, latencyMs: Date.now() - started };
  }
}
