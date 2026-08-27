import Anthropic from "@anthropic-ai/sdk";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt.ts";
import type { Verdict } from "./gate.ts";

export const MODEL = "claude-haiku-4-5";
export const MAX_TOKENS = 1000;
export const TIMEOUT_MS = 8000;

const SEVERITIES = ["info", "caution", "warning", "critical"];
const CATEGORIES = [
  "armed_robbery",
  "kidnapping",
  "banditry",
  "unrest_protest",
  "road_incident",
  "fire",
  "flood",
  "cult_clash",
  "police_activity",
  "fraud_scam",
  "terrorism",
  "herder_farmer",
  "other",
];

export interface ArticleInput {
  title: string;
  summary: string;
  sourceName: string;
  publishedAt: string | null;
}

export interface ModelResponse {
  stop_reason: string | null;
  text: string | null;
}

export interface ModelClient {
  create(article: ArticleInput): Promise<ModelResponse>;
}

export type ClassifyResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; failure: "refusal" | "transport" | "malformed" | "invalid" };

function validate(raw: unknown): Verdict | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;

  if (typeof v.is_security_relevant !== "boolean") return null;
  if (typeof v.category !== "string" || !CATEGORIES.includes(v.category)) return null;
  if (typeof v.severity !== "string" || !SEVERITIES.includes(v.severity)) return null;
  if (typeof v.headline !== "string" || typeof v.summary !== "string") return null;
  if (v.advice !== null && typeof v.advice !== "string") return null;
  if (typeof v.confidence !== "number" || !(v.confidence >= 0 && v.confidence <= 1)) {
    return null;
  }
  if (!Array.isArray(v.locations)) return null;

  for (const loc of v.locations) {
    if (typeof loc !== "object" || loc === null) return null;
    const l = loc as Record<string, unknown>;
    if (typeof l.state !== "string") return null;
    if (l.lga !== null && typeof l.lga !== "string") return null;
    if (l.landmark !== null && typeof l.landmark !== "string") return null;
  }

  return v as unknown as Verdict;
}

/** Never throws. Every failure is a typed result the caller can route on. */
export async function classify(
  article: ArticleInput,
  client: ModelClient,
): Promise<ClassifyResult> {
  let res: ModelResponse;
  try {
    res = await client.create(article);
  } catch {
    return { ok: false, failure: "transport" };
  }

  // A refusal arrives as HTTP 200 with no exception. Check stop_reason BEFORE
  // touching content, or we read an empty block and misreport the cause.
  if (res.stop_reason === "refusal") return { ok: false, failure: "refusal" };
  if (typeof res.text !== "string" || res.text.trim() === "") {
    return { ok: false, failure: "malformed" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return { ok: false, failure: "malformed" };
  }

  const verdict = validate(parsed);
  if (!verdict) return { ok: false, failure: "invalid" };
  return { ok: true, verdict };
}

/**
 * claude-haiku-4-5 is a pre-4.6 model: no output_config.effort (it errors), no
 * thinking, no server-side fallbacks. temperature IS accepted here, unlike on
 * 4.6+ models.
 */
export function makeAnthropicClient(apiKey: string): ModelClient {
  const anthropic = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    async create(article: ArticleInput): Promise<ModelResponse> {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{
          role: "user",
          content: [
            `Source: ${article.sourceName}`,
            `Published: ${article.publishedAt ?? "unknown"}`,
            `Title: ${article.title}`,
            `Body: ${article.summary}`,
          ].join("\n"),
        }],
      });

      const block = response.content.find((b) => b.type === "text");
      return {
        stop_reason: response.stop_reason,
        text: block && block.type === "text" ? block.text : null,
      };
    },
  };
}
