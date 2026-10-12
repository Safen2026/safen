/**
 * Matches a device reverse-geocode to the Nigerian gazetteer.
 *
 * Geocoders disagree on naming: the same place comes back as "Lagos",
 * "Lagos State" or "LAGOS", and the capital as "Abuja", "FCT" or "Federal
 * Capital Territory". An exact match on those strings resolved no user at all,
 * so everyone silently got the national feed. This mirrors the server-side
 * normalisation in supabase/functions/_shared/gazetteer.ts.
 */

interface Named { code: string; name: string }

/** Nigerian usage: "Abuja" almost always means the FCT. */
const STATE_SYNONYMS: Record<string, string> = {
  'abuja'                            : 'federal capital territory',
  'fct'                              : 'federal capital territory',
  'f c t'                            : 'federal capital territory',
  'abuja federal capital territory'  : 'federal capital territory',
  'nassarawa'                        : 'nasarawa',
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:'"()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findByName(wanted: string, rows: Named[]): string | null {
  return rows.find((r) => normalise(r.name) === wanted)?.code ?? null;
}

export function matchState(region: string | null | undefined, states: Named[]): string | null {
  if (!region) return null;
  let key = normalise(region).replace(/ state$/, '');
  key = STATE_SYNONYMS[key] ?? key;
  return key ? findByName(key, states) : null;
}

export function matchLga(subregion: string | null | undefined, lgas: Named[]): string | null {
  if (!subregion) return null;
  const key = normalise(subregion)
    .replace(/ (local government area|local government|lga)$/, '');
  return key ? findByName(key, lgas) : null;
}
