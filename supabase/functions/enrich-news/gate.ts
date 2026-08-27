export const CONFIDENCE_FLOOR = 0.7;

export interface Verdict {
  is_security_relevant: boolean;
  category: string;
  severity: string;
  locations: { state: string; lga: string | null; landmark: string | null }[];
  headline: string;
  summary: string;
  advice: string | null;
  confidence: number;
}

export interface ResolvedLocation {
  state_code: string;
  lga_code: string | null;
}

export type GateResult =
  | { publish: true; reason: null }
  | {
    publish: false;
    reason: "not_relevant" | "low_confidence" | "no_location" | "empty_copy";
  };

/**
 * Fails CLOSED. This is the deliberate mirror of the report quality gate, which
 * fails open so a broken AI can never stop someone filing a report. Here the
 * asymmetry runs the other way: an unpublished article is merely invisible,
 * while a wrongly-published one is misinformation inside a safety app.
 */
export function evaluateGate(v: Verdict, resolved: ResolvedLocation[]): GateResult {
  if (!v.is_security_relevant) return { publish: false, reason: "not_relevant" };
  if (!(v.confidence >= CONFIDENCE_FLOOR)) {
    return { publish: false, reason: "low_confidence" };
  }
  if (resolved.length === 0) return { publish: false, reason: "no_location" };
  if (v.headline.trim() === "" || v.summary.trim() === "") {
    return { publish: false, reason: "empty_copy" };
  }
  return { publish: true, reason: null };
}
