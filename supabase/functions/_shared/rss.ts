import { XMLParser } from "fast-xml-parser";

export interface ParsedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** A feed that omits a date must yield null — never Date.now(), which would
 *  brand a week-old story as breaking news in a safety feed. */
function toIso(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseFeed(xml: string): ParsedItem[] {
  // deno-lint-ignore no-explicit-any
  let doc: Record<string, any>;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomEntries = asArray(doc?.feed?.entry);

  const out: ParsedItem[] = [];

  for (const it of rssItems) {
    const url = typeof it?.link === "string" ? it.link.trim() : "";
    if (!url) continue;
    out.push({
      title: stripHtml(String(it?.title ?? "")),
      url,
      summary: stripHtml(String(it?.description ?? "")),
      publishedAt: toIso(it?.pubDate),
    });
  }

  for (const e of atomEntries) {
    const link = e?.link;
    const url = (Array.isArray(link) ? link[0]?.["@_href"] : link?.["@_href"]) ??
      (typeof link === "string" ? link : "");
    if (!url) continue;
    out.push({
      title: stripHtml(String(e?.title ?? "")),
      url: String(url).trim(),
      summary: stripHtml(String(e?.summary ?? e?.content ?? "")),
      publishedAt: toIso(e?.updated ?? e?.published),
    });
  }

  return out;
}
