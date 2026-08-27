import { parseFeed } from "../_shared/rss.ts";
import { urlHash } from "../_shared/url.ts";

export const MAX_CONSECUTIVE_FAILURES = 5;

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
