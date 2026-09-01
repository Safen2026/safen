export type Category = "medical" | "fire" | "security" | "missing_person";

export interface CheckInput {
  category: Category;
  description: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  has_media?: boolean;
  last_seen_at?: string | null;
  police_reference?: string | null;
}

export interface PrefilterResult {
  ok: boolean;
  missing: string[];
  feedback: string;
}

export function wordCount(s: string): number {
  const t = (s ?? "").trim();
  return t === "" ? 0 : t.split(/[ \t\n\r\f\v]+/).length;
}

const PROMPTS: Record<string, string> = {
  description: "Please describe what happened in a bit more detail — what you saw, and when.",
  location: "We could not read your location. Turn on location, or type the nearest landmark.",
  photo: "A missing-person report needs a recent photo of the person.",
  last_seen_at: "When was the person last seen? Please give the date and time.",
  police_reference: "Please add the police station and case reference for this report.",
};

/** Deterministic checks that never need the model. Cheapest call is the one not made. */
export function prefilter(input: CheckInput, minWords: number): PrefilterResult {
  const missing: string[] = [];

  if (wordCount(input.description) < minWords) missing.push("description");

  // Coordinates are only mandatory for missing-person reports, because that is
  // the only category the database requires them for. Making them mandatory
  // everywhere permanently locks out any user who declined the location
  // permission, since the app offers no way to supply coordinates by hand.
  if (input.category === "missing_person") {
    if (input.latitude == null || input.longitude == null) missing.push("location");
    if (!input.has_media) missing.push("photo");
    if (!input.last_seen_at) missing.push("last_seen_at");
    if (!input.police_reference || input.police_reference.trim() === "") {
      missing.push("police_reference");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    feedback: missing.map((m) => PROMPTS[m]).filter(Boolean).join(" "),
  };
}
