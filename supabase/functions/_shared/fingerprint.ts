/**
 * Normalisation MUST stay byte-identical to public.report_payload_fingerprint
 * in supabase/migrations/20260812120000_fingerprint.sql.
 * The character class is written out explicitly rather than using \s, because
 * JS \s matches Unicode spaces (e.g. U+00A0) that Postgres [[:space:]] does not.
 */
export function normalise(s: string): string {
  return s.replace(/[ \t\n\r\f\v]+/g, " ").trim().toLowerCase();
}

export async function fingerprint(category: string, description: string): Promise<string> {
  const canonical = `${normalise(category ?? "")}\n${normalise(description ?? "")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
