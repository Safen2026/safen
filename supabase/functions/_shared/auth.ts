/**
 * Shared-secret check for machine callers (pg_cron, Database Webhooks).
 *
 * The gateway's verify_jwt only proves the caller holds *a* project key — and
 * the publishable key ships in the app bundle, so that proves nothing. These
 * functions spend money (Anthropic) or reach every user (push), so they must
 * also prove the caller knows a secret that never leaves the server side.
 *
 * Fails closed: an unset secret rejects everything rather than letting
 * everything through.
 */
export async function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): Promise<boolean> {
  if (!expected || !provided) return false;
  // Hash both sides so the comparison is fixed-length and constant-time —
  // a byte-by-byte early exit would leak the secret's prefix via timing.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Header name the cron jobs send; see migration news_pipeline_cron_secret. */
export const CRON_SECRET_HEADER = "x-cron-secret";

/** Header name the Database Webhook sends; configured in the dashboard. */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";
