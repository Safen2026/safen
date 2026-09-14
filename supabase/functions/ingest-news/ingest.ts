import { parseFeed } from "../_shared/rss.ts";
import { urlHash } from "../_shared/url.ts";

export const MAX_CONSECUTIVE_FAILURES = 5;

/** Real Nigerian WordPress feeds are well under 1 MB; 5 MB is headroom, not a
 *  target. Anything bigger is a misconfigured or hostile source. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

/**
 * Only public https hostnames are fetchable. news_sources is service-role
 * only, but a bad row (or a redirect from a good one) must still never point
 * the function at localhost, the metadata service, or an internal container.
 *
 * IP literals are refused outright rather than range-checked: no legitimate
 * feed is addressed by IP, and the URL parser already normalises tricks like
 * https://2130706433/ into 127.0.0.1 so they are caught here too. Single-label
 * hosts (kong, db, metadata) are refused for the same reason.
 *
 * Not covered: a public hostname whose DNS resolves to a private address.
 * That needs resolve-then-connect pinning, which fetch() does not expose.
 */
export function assertSafeFeedUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("feed url is not a valid URL");
  }
  if (u.protocol !== "https:") throw new Error("feed url must be https");
  if (u.username || u.password) throw new Error("feed url must not carry credentials");
  if (u.port && u.port !== "443") throw new Error("feed url must use the default port");

  const host = u.hostname.toLowerCase();
  if (host.startsWith("[") || host.includes(":")) throw new Error("feed url must not be an IP address");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error("feed url must not be an IP address");
  if (!host.includes(".")) throw new Error("feed url must be a public hostname");
  if (/(^|\.)(localhost|local|internal|localdomain|home\.arpa)\.?$/.test(host)) {
    throw new Error("feed url must be a public hostname");
  }
  return u.href;
}

/** Reads a response body but aborts once it passes maxBytes, so a huge or
 *  endless feed cannot exhaust the function's memory. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new Error(`feed too large (${declared} bytes)`);
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`feed too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(out);
}

export interface SourceRow {
  id: string;
  name: string;
  rss_url: string;
  consecutive_failures: number;
}

export interface RawInsert {
  source_id: string;
  url: string;
  url_hash: string;
  title: string;
  raw_summary: string;
  published_at: string | null;
}

export interface IngestDeps {
  listSources(): Promise<SourceRow[]>;
  fetchText(url: string): Promise<string>;
  insertRaw(rows: RawInsert[]): Promise<number>;
  markSuccess(sourceId: string): Promise<void>;
  markFailure(sourceId: string, err: string, failuresSoFar: number): Promise<void>;
}

/** Every source is isolated: a timeout or parse failure on one must never
 *  reduce what the others contribute. */
export async function ingestAll(
  deps: IngestDeps,
): Promise<{ inserted: number; failed: string[] }> {
  const sources = await deps.listSources();
  let inserted = 0;
  const failed: string[] = [];

  for (const src of sources) {
    try {
      const xml = await deps.fetchText(src.rss_url);
      const items = parseFeed(xml);

      const rows: RawInsert[] = [];
      for (const it of items) {
        rows.push({
          source_id: src.id,
          url: it.url,
          url_hash: await urlHash(it.url),
          title: it.title,
          raw_summary: it.summary,
          published_at: it.publishedAt,
        });
      }

      if (rows.length > 0) inserted += await deps.insertRaw(rows);
      await deps.markSuccess(src.id);
    } catch (err) {
      failed.push(src.id);
      await deps.markFailure(
        src.id,
        err instanceof Error ? err.message : String(err),
        src.consecutive_failures,
      );
    }
  }

  return { inserted, failed };
}
