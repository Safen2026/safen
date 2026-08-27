import type { ResolvedLocation } from "../enrich-news/gate.ts";

export interface GazetteerTables {
  states: { code: string; name: string }[];
  lgas: { code: string; state_code: string; name: string }[];
  aliases: { alias_norm: string; state_code: string; lga_code: string | null }[];
}

/** Nigerian usage: "Abuja" almost always means the FCT in news copy. */
const STATE_SYNONYMS: Record<string, string> = {
  "abuja": "federal capital territory",
  "fct": "federal capital territory",
  "f c t": "federal capital territory",
  "nasarawa state": "nasarawa",
};

export function normalisePlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+state$/, "");
}

export function resolveLocations(
  locations: { state: string; lga: string | null; landmark: string | null }[],
  tables: GazetteerTables,
): ResolvedLocation[] {
  const stateByName = new Map(tables.states.map((s) => [normalisePlace(s.name), s.code]));
  const seen = new Set<string>();
  const out: ResolvedLocation[] = [];

  for (const loc of locations) {
    let key = normalisePlace(loc.state);
    key = STATE_SYNONYMS[key] ?? key;
    const stateCode = stateByName.get(key);
    // Never guess a state we were given no evidence for.
    if (!stateCode) continue;

    let lgaCode: string | null = null;

    if (loc.lga) {
      const wanted = normalisePlace(loc.lga);
      lgaCode = tables.lgas.find(
        (l) => l.state_code === stateCode && normalisePlace(l.name) === wanted,
      )?.code ?? null;
    }

    if (!lgaCode && loc.landmark) {
      const wanted = normalisePlace(loc.landmark);
      lgaCode = tables.aliases.find(
        (a) => a.state_code === stateCode && a.alias_norm === wanted,
      )?.lga_code ?? null;
    }

    const dedupKey = `${stateCode}|${lgaCode ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push({ state_code: stateCode, lga_code: lgaCode });
  }

  return out;
}
