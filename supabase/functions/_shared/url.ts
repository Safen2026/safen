/**
 * Canonical form used as the cross-source dedup key. The same wire story runs
 * on several Nigerian outlets with different tracking parameters; without this
 * the feed shows the same attack four times.
 *
 * Path case is preserved deliberately — some Nigerian CMSes serve
 * case-sensitive slugs, so lowercasing the path would merge distinct stories.
 */
export function canonicalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${host}${path}`;
}

export async function urlHash(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeUrl(raw));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
