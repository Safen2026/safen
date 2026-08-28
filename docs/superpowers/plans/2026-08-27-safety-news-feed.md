# Safety News Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a blended, location-scoped security feed on Safen's home screen — Nigerian news outlets enriched by Claude, plus a sealed seam for community reports — with push only for severe incidents nearby.

**Architecture:** Two cron-driven Supabase Edge Functions form a durable pipeline: `ingest-news` parses allowlisted RSS into a raw queue with no AI involved, and `enrich-news` classifies each queued article with `claude-haiku-4-5` into a structured verdict, resolving Nigerian place names to state/LGA codes via a seeded gazetteer. A single SQL RPC unions news with an initially-empty community function, ranks by severity × recency × proximity, and paginates. The React Native client reads that RPC through one hook.

**Tech Stack:** Supabase (Postgres 17.6 + Edge Functions on Deno 2), `npm:@anthropic-ai/sdk`, `npm:fast-xml-parser`, Expo / React Native 0.81, `expo-location`, `expo-notifications`, `expo-linking`.

**Spec:** `docs/superpowers/specs/2026-08-27-safety-news-feed-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Model is `claude-haiku-4-5`.** It is a pre-4.6 model. Do **not** send `output_config.effort` (errors). Do **not** send `thinking`. Do **not** send server-side `fallbacks` (Opus 5 / Fable 5 only). **Do** send `temperature: 0`.
- Anthropic request limits: `max_tokens: 1000`, request timeout `8000` ms, `maxRetries: 1`.
- **Check `stop_reason` before reading `content`.** A refusal is HTTP 200 with no exception raised. Do not assume `stop_details` is populated on Haiku 4.5.
- **Fail closed.** Publish gate is exactly: `is_security_relevant === true && confidence >= 0.7 && at least one location resolves to a real state or LGA`. Anything else is `rejected`.
- Recency decay: exponential, **half-life exactly 12 hours**.
- Proximity weights: **same LGA 1.0 | same state 0.6 | national 0.3**.
- A news source auto-disables after **5 consecutive failures**.
- Enrichment retries to a maximum of **3 attempts**, then `failed`. A refusal is `rejected` and is **never** retried.
- Push cap: **3 per user per day**, and only for severity `critical` or `warning` **with** an LGA match.
- RLS: `news_items`, `ng_states`, `ng_lgas`, `ng_place_aliases` are **SELECT-only** for `authenticated`. `news_sources` and `news_items_raw` are **service-role only** and never exposed to PostgREST.
- **Every Deno invocation must pass `--config supabase/functions/deno.json`.** Deno only discovers a config from the cwd downward; omitting this breaks any module importing `npm:`. This exact defect cost the previous spec a task.
- **TypeScript baseline is 9 pre-existing errors** (`expo-network`, `expo-sms`, `@react-native-firebase/*`, and one `void` truthiness error in `useEmergencyRecording.ts`). Client tasks verify "still 9", never "zero".
- Nigerian context stays explicit — state/LGA naming, no generic i18n abstractions.
- Do not touch the Cloudinary `FormData + fetch` upload path. Do not reintroduce Twilio. Use `getSession()`, never `getUser()`, for any storage-auth operation.
- Prefer minimal diffs matching existing file patterns over new libraries or state patterns.

---

### Task 1: Database rehearsal environment (hard gate)

No code. Nothing downstream may be marked complete while its migrations are unexecuted — that is the single failure that stranded `feat/ai-features` (11 migrations, 0 executed).

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: a reachable local Postgres and an exported `SUPABASE_DB_URL`, used by every SQL task.

- [ ] **Step 1: Start the Docker daemon**

Docker 29.5.3 is installed but its daemon is not running. Ask the human to launch Docker Desktop and wait for it to report *Engine running*. In an interactive session they can run:

```
! docker info --format "{{.ServerVersion}}"
```

Expected: a version string, not `failed to connect to the docker API`.

- [ ] **Step 2: Start local Supabase**

```bash
npx supabase start
```

Expected: a block of URLs ending with `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] **Step 3: Export the DB URL and verify connectivity**

```bash
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
npx supabase db reset --local
```

Expected: the two existing migrations (`20260819_alert_acknowledgements.sql`, `2026081901_notifications_type_fix.sql`) apply cleanly. This proves the baseline schema is replayable before we add to it.

- [ ] **Step 4: Record the gate**

Confirm in the execution ledger that `SUPABASE_DB_URL` is set and `db push` succeeded. **Never point `SUPABASE_DB_URL` at the linked production project `ujbknxfvatvtwthxtytu`.**

---

### Task 2: Deno workspace + URL canonicalization

Establishes the Deno toolchain and delivers the dedup key. Doing these together means the first test run proves the toolchain itself.

**Files:**
- Create: `supabase/functions/deno.json`
- Create: `supabase/functions/_shared/url.ts`
- Test: `supabase/functions/_shared/url_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `canonicalizeUrl(raw: string): string` and `urlHash(raw: string): Promise<string>` (64-char lowercase hex sha256 of the canonical form).

- [ ] **Step 1: Create the Deno config**

`supabase/functions/deno.json`:

```json
{
  "imports": {
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.120.0",
    "fast-xml-parser": "npm:fast-xml-parser@^4.5.1",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@^2.110.0"
  }
}
```

- [ ] **Step 2: Write the failing test**

`supabase/functions/_shared/url_test.ts`:

```ts
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { canonicalizeUrl, urlHash } from "./url.ts";

Deno.test("lowercases host and strips www", () => {
  assertEquals(
    canonicalizeUrl("https://WWW.Punchng.com/story-a"),
    "https://punchng.com/story-a",
  );
});

Deno.test("strips query string, fragment and trailing slash", () => {
  assertEquals(
    canonicalizeUrl("https://punchng.com/story-a/?utm_source=rss#top"),
    "https://punchng.com/story-a",
  );
});

Deno.test("preserves path case (Nigerian slugs are case-sensitive on some CMSes)", () => {
  assertEquals(
    canonicalizeUrl("https://punchng.com/Ikeja-Robbery"),
    "https://punchng.com/Ikeja-Robbery",
  );
});

Deno.test("same story from two URLs hashes identically", async () => {
  const a = await urlHash("https://www.punchng.com/story-a/?utm_medium=feed");
  const b = await urlHash("https://punchng.com/story-a");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("different stories hash differently", async () => {
  assertNotEquals(
    await urlHash("https://punchng.com/story-a"),
    await urlHash("https://punchng.com/story-b"),
  );
});

Deno.test("a malformed URL falls back to the trimmed raw string, never throws", () => {
  assertEquals(canonicalizeUrl("  not a url  "), "not a url");
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/url_test.ts
```

Expected: FAIL — `Module not found ... url.ts`.

- [ ] **Step 3: Write minimal implementation**

`supabase/functions/_shared/url.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/url_test.ts
```

Expected: `ok | 6 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/deno.json supabase/functions/_shared/url.ts supabase/functions/_shared/url_test.ts
git commit -m "feat(feed): deno workspace config and URL canonicalization for dedup"
```

---

### Task 3: RSS/Atom parsing

**Files:**
- Create: `supabase/functions/_shared/rss.ts`
- Create: `supabase/functions/_shared/fixtures/rss2-sample.xml`
- Create: `supabase/functions/_shared/fixtures/atom-sample.xml`
- Test: `supabase/functions/_shared/rss_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export interface ParsedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null; // ISO 8601, or null when the feed omits/mangles it
}
export function parseFeed(xml: string): ParsedItem[];
```

- [ ] **Step 1: Create the fixtures**

`supabase/functions/_shared/fixtures/rss2-sample.xml` — shaped like a Nigerian outlet's RSS 2.0 feed, including one item with HTML in the description and one with no `pubDate`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Nigerian Daily</title>
    <item>
      <title>Police repel robbery attempt on Allen Avenue, Ikeja</title>
      <link>https://example.ng/allen-avenue-robbery/?utm_source=rss</link>
      <description><![CDATA[<p>Officers <b>repelled</b> an attack in Ikeja, Lagos State.</p>]]></description>
      <pubDate>Wed, 27 Aug 2026 08:30:00 +0100</pubDate>
    </item>
    <item>
      <title>Traffic diversion announced for Wuse II</title>
      <link>https://example.ng/wuse-diversion</link>
      <description>Road closure in Abuja from Monday.</description>
    </item>
  </channel>
</rss>
```

`supabase/functions/_shared/fixtures/atom-sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Atom Outlet</title>
  <entry>
    <title>Kidnapping reported along Kaduna-Abuja highway</title>
    <link href="https://example.ng/kaduna-highway"/>
    <summary>Travellers advised to avoid night journeys.</summary>
    <updated>2026-08-27T09:15:00Z</updated>
  </entry>
</feed>
```

- [ ] **Step 2: Write the failing test**

`supabase/functions/_shared/rss_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { parseFeed } from "./rss.ts";

const rss2 = await Deno.readTextFile(
  new URL("./fixtures/rss2-sample.xml", import.meta.url),
);
const atom = await Deno.readTextFile(
  new URL("./fixtures/atom-sample.xml", import.meta.url),
);

Deno.test("parses RSS 2.0 items", () => {
  const items = parseFeed(rss2);
  assertEquals(items.length, 2);
  assertEquals(items[0].title, "Police repel robbery attempt on Allen Avenue, Ikeja");
  assertEquals(items[0].url, "https://example.ng/allen-avenue-robbery/?utm_source=rss");
});

Deno.test("strips HTML from descriptions", () => {
  const items = parseFeed(rss2);
  assertEquals(items[0].summary, "Officers repelled an attack in Ikeja, Lagos State.");
});

Deno.test("normalises pubDate to ISO 8601", () => {
  const items = parseFeed(rss2);
  assertEquals(items[0].publishedAt, "2026-08-27T07:30:00.000Z");
});

Deno.test("a missing pubDate yields null, not a crash and not Date.now()", () => {
  const items = parseFeed(rss2);
  assertEquals(items[1].publishedAt, null);
});

Deno.test("parses Atom entries including href links", () => {
  const items = parseFeed(atom);
  assertEquals(items.length, 1);
  assertEquals(items[0].url, "https://example.ng/kaduna-highway");
  assertEquals(items[0].publishedAt, "2026-08-27T09:15:00.000Z");
});

Deno.test("malformed XML returns an empty array rather than throwing", () => {
  assertEquals(parseFeed("<rss><channel><item>"), []);
});

Deno.test("an item with no link is dropped", () => {
  const xml = `<rss version="2.0"><channel><item><title>No link</title></item></channel></rss>`;
  assertEquals(parseFeed(xml), []);
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/rss_test.ts
```

Expected: FAIL — `Module not found ... rss.ts`.

- [ ] **Step 3: Write minimal implementation**

`supabase/functions/_shared/rss.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/rss_test.ts
```

Expected: `ok | 7 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/rss.ts supabase/functions/_shared/rss_test.ts supabase/functions/_shared/fixtures
git commit -m "feat(feed): RSS 2.0 and Atom parsing with HTML stripping"
```

---

### Task 4: `news_sources` and `news_items_raw` migrations

Both tables are service-role only and change together, so they ship together.

**Files:**
- Create: `supabase/migrations/20260827120000_news_sources.sql`
- Create: `supabase/migrations/20260827120100_news_items_raw.sql`
- Test: `supabase/tests/20_news_ingest_tables.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.news_sources`, `public.news_items_raw`; enum-like `status` values `pending|enriched|rejected|failed`.

- [ ] **Step 1: Write the migration for `news_sources`**

`supabase/migrations/20260827120000_news_sources.sql`:

```sql
-- Allowlisted Nigerian news feeds. Service-role only: there is deliberately no
-- grant to `authenticated`, so no client can introduce a source URL.
create table if not exists public.news_sources (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  rss_url              text not null unique,
  enabled              boolean not null default true,
  last_fetched_at      timestamptz,
  consecutive_failures integer not null default 0,
  created_at           timestamptz not null default now()
);

alter table public.news_sources enable row level security;
revoke all on public.news_sources from anon, authenticated;

comment on column public.news_sources.consecutive_failures is
  'Auto-disabled at 5. RSS feeds break silently; without this the feed just thins out.';

insert into public.news_sources (name, rss_url) values
  ('Punch',            'https://punchng.com/feed/'),
  ('Vanguard',         'https://www.vanguardngr.com/feed/'),
  ('Premium Times',    'https://www.premiumtimesng.com/feed'),
  ('Channels TV',      'https://www.channelstv.com/feed/'),
  ('The Cable',        'https://www.thecable.ng/feed'),
  ('Daily Post',       'https://dailypost.ng/feed/')
on conflict (rss_url) do nothing;
```

- [ ] **Step 2: Write the migration for `news_items_raw`**

`supabase/migrations/20260827120100_news_items_raw.sql`:

```sql
-- Durable ingest queue. Separating this from enrichment means a Claude outage
-- cannot lose already-fetched articles; the backlog drains on the next tick.
create table if not exists public.news_items_raw (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.news_sources(id) on delete cascade,
  url          text not null,
  url_hash     text not null unique,
  title        text not null,
  raw_summary  text not null default '',
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  status       text not null default 'pending'
                 check (status in ('pending','enriched','rejected','failed')),
  attempts     integer not null default 0,
  last_error   text
);

create index if not exists news_items_raw_pending_idx
  on public.news_items_raw (status, fetched_at)
  where status = 'pending';

alter table public.news_items_raw enable row level security;
revoke all on public.news_items_raw from anon, authenticated;
```

- [ ] **Step 3: Write the SQL assertions**

`supabase/tests/20_news_ingest_tables.sql`:

```sql
\set ON_ERROR_STOP on
begin;

do $$
begin
  if (select count(*) from public.news_sources) < 6 then
    raise exception 'expected the 6 seeded sources';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_name in ('news_sources','news_items_raw')
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'news ingest tables must not be reachable from PostgREST';
  end if;
end $$;

-- url_hash uniqueness is the cross-source dedup guarantee
insert into public.news_items_raw (source_id, url, url_hash, title)
select id, 'https://a.ng/x', 'hash-dup-test', 'first' from public.news_sources limit 1;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.news_items_raw (source_id, url, url_hash, title)
    select id, 'https://b.ng/x', 'hash-dup-test', 'second' from public.news_sources limit 1;
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate url_hash must be rejected'; end if;
end $$;

rollback;
```

- [ ] **Step 4: Apply and run**

```bash
npx supabase db reset --local
bash supabase/tests/run.sh   # runs 20_news_ingest_tables.sql and every other assertion file
```

Expected: migrations apply; the assertion file completes with no exception raised.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260827120000_news_sources.sql supabase/migrations/20260827120100_news_items_raw.sql supabase/tests/20_news_ingest_tables.sql
git commit -m "feat(feed): news_sources and news_items_raw with service-role-only access"
```

---

### Task 5: `ingest-news` Edge Function

**Files:**
- Create: `supabase/functions/ingest-news/ingest.ts`
- Create: `supabase/functions/ingest-news/index.ts`
- Test: `supabase/functions/ingest-news/ingest_test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `parseFeed` (Task 3), `urlHash` (Task 2).
- Produces:
```ts
export interface SourceRow { id: string; name: string; rss_url: string; consecutive_failures: number }
export interface IngestDeps {
  listSources(): Promise<SourceRow[]>;
  fetchText(url: string): Promise<string>;
  insertRaw(rows: RawInsert[]): Promise<number>;   // returns rows actually inserted
  markSuccess(sourceId: string): Promise<void>;
  markFailure(sourceId: string, err: string, failuresSoFar: number): Promise<void>;
}
export interface RawInsert {
  source_id: string; url: string; url_hash: string;
  title: string; raw_summary: string; published_at: string | null;
}
export async function ingestAll(deps: IngestDeps): Promise<{ inserted: number; failed: string[] }>;
```

- [ ] **Step 1: Write the failing test**

`supabase/functions/ingest-news/ingest_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { ingestAll, type IngestDeps, type SourceRow } from "./ingest.ts";

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Robbery in Ikeja</title><link>https://a.ng/one</link>
<description>Details</description><pubDate>Wed, 27 Aug 2026 08:30:00 +0100</pubDate></item>
</channel></rss>`;

function deps(over: Partial<IngestDeps> = {}): IngestDeps & { inserted: any[]; failures: string[] } {
  const inserted: any[] = [];
  const failures: string[] = [];
  const base: IngestDeps = {
    listSources: () => Promise.resolve([
      { id: "s1", name: "A", rss_url: "https://a.ng/feed", consecutive_failures: 0 },
      { id: "s2", name: "B", rss_url: "https://b.ng/feed", consecutive_failures: 0 },
    ] as SourceRow[]),
    fetchText: () => Promise.resolve(FEED),
    insertRaw: (rows) => { inserted.push(...rows); return Promise.resolve(rows.length); },
    markSuccess: () => Promise.resolve(),
    markFailure: (id) => { failures.push(id); return Promise.resolve(); },
  };
  return Object.assign({}, base, over, { inserted, failures }) as any;
}

Deno.test("ingests items from every enabled source", async () => {
  const d = deps();
  const r = await ingestAll(d);
  assertEquals(r.inserted, 2);
  assertEquals(d.inserted[0].url_hash.length, 64);
  assertEquals(d.inserted[0].source_id, "s1");
});

Deno.test("one failing source does not stop the others", async () => {
  const d = deps({
    fetchText: (url: string) => url.includes("a.ng")
      ? Promise.reject(new Error("boom"))
      : Promise.resolve(FEED),
  });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 1);
  assertEquals(r.failed, ["s1"]);
  assertEquals(d.failures, ["s1"]);
});

Deno.test("published_at survives as ISO", async () => {
  const d = deps();
  await ingestAll(d);
  assertEquals(d.inserted[0].published_at, "2026-08-27T07:30:00.000Z");
});

Deno.test("an empty feed is a success, not a failure", async () => {
  const d = deps({ fetchText: () => Promise.resolve("<rss><channel></channel></rss>") });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 0);
  assertEquals(r.failed, []);
});

Deno.test("insert errors are contained per source", async () => {
  const d = deps({ insertRaw: () => Promise.reject(new Error("db down")) });
  const r = await ingestAll(d);
  assertEquals(r.inserted, 0);
  assertEquals(r.failed.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/ingest-news/ingest_test.ts
```

Expected: FAIL — `Module not found ... ingest.ts`.

- [ ] **Step 3: Write the implementation**

`supabase/functions/ingest-news/ingest.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/ingest-news/ingest_test.ts
```

Expected: `ok | 5 passed | 0 failed`.

- [ ] **Step 5: Write the HTTP entrypoint**

`supabase/functions/ingest-news/index.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { ingestAll, MAX_CONSECUTIVE_FAILURES, type IngestDeps, type SourceRow } from "./ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FETCH_TIMEOUT_MS = 10_000;

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const deps: IngestDeps = {
    async listSources() {
      const { data, error } = await db
        .from("news_sources")
        .select("id, name, rss_url, consecutive_failures")
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },

    async fetchText(url) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "user-agent": "SafenBot/1.0 (+https://safen.ng)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    },

    async insertRaw(rows) {
      // ignoreDuplicates leans on the url_hash unique index: re-running a tick
      // is a no-op rather than an error, which keeps ingestion idempotent.
      const { data, error } = await db
        .from("news_items_raw")
        .upsert(rows, { onConflict: "url_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async markSuccess(sourceId) {
      await db.from("news_sources")
        .update({ last_fetched_at: new Date().toISOString(), consecutive_failures: 0 })
        .eq("id", sourceId);
    },

    async markFailure(sourceId, err, failuresSoFar) {
      const next = failuresSoFar + 1;
      await db.from("news_sources")
        .update({
          consecutive_failures: next,
          enabled: next < MAX_CONSECUTIVE_FAILURES,
        })
        .eq("id", sourceId);
      console.error(`ingest-news: source ${sourceId} failed (${next}): ${err}`);
    },
  };

  try {
    const result = await ingestAll(deps);
    console.log(`ingest-news: inserted=${result.inserted} failed=${result.failed.length}`);
    return Response.json(result);
  } catch (err) {
    console.error("ingest-news fatal:", err);
    return new Response("ingest failed", { status: 500 });
  }
});
```

- [ ] **Step 6: Register the function**

Append to `supabase/config.toml`:

```toml
[functions.ingest-news]
enabled = true
verify_jwt = true
import_map = "./functions/deno.json"
entrypoint = "./functions/ingest-news/index.ts"
```

- [ ] **Step 7: Type-check the entrypoint**

```bash
npx deno@2 check --config supabase/functions/deno.json supabase/functions/ingest-news/index.ts
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/ingest-news supabase/config.toml
git commit -m "feat(feed): ingest-news edge function with per-source failure isolation"
```

---

### Task 6: Gazetteer tables, state seed, alias seed

**Files:**
- Create: `supabase/migrations/20260827120200_gazetteer.sql`
- Create: `supabase/migrations/20260827120300_gazetteer_seed_states.sql`
- Create: `supabase/migrations/20260827120400_gazetteer_seed_aliases.sql`
- Create: `supabase/migrations/20260827120450_profiles_area.sql`
- Create: `supabase/migrations/20260827120500_gazetteer_seed_lgas.sql` (generated — see Step 3)
- Test: `supabase/tests/21_gazetteer.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.ng_states(code, name)`, `public.ng_lgas(code, state_code, name)`, `public.ng_place_aliases(alias_norm, state_code, lga_code)`, and `profiles.last_state_code` / `profiles.last_lga_code`.

- [ ] **Step 1: Write the schema migration**

`supabase/migrations/20260827120200_gazetteer.sql`:

```sql
-- Nigeria-first by design: this is an explicit state/LGA gazetteer, not a
-- generic i18n geography abstraction.
create table if not exists public.ng_states (
  code text primary key,
  name text not null unique
);

create table if not exists public.ng_lgas (
  code       text primary key,
  state_code text not null references public.ng_states(code) on delete cascade,
  name       text not null,
  unique (state_code, name)
);

-- An alias may be genuinely ambiguous ("Sabon Gari" exists in several states).
-- Ambiguity is represented as multiple rows and resolved by state context.
create table if not exists public.ng_place_aliases (
  id         uuid primary key default gen_random_uuid(),
  alias_norm text not null,
  state_code text not null references public.ng_states(code) on delete cascade,
  lga_code   text references public.ng_lgas(code) on delete cascade,
  unique (alias_norm, state_code, lga_code)
);

create index if not exists ng_place_aliases_norm_idx on public.ng_place_aliases (alias_norm);
create index if not exists ng_lgas_name_idx on public.ng_lgas (lower(name));

alter table public.ng_states        enable row level security;
alter table public.ng_lgas          enable row level security;
alter table public.ng_place_aliases enable row level security;

create policy ng_states_read   on public.ng_states        for select to authenticated using (true);
create policy ng_lgas_read     on public.ng_lgas          for select to authenticated using (true);
create policy ng_aliases_read  on public.ng_place_aliases for select to authenticated using (true);

grant select on public.ng_states, public.ng_lgas, public.ng_place_aliases to authenticated;
revoke insert, update, delete on public.ng_states, public.ng_lgas, public.ng_place_aliases
  from anon, authenticated;
```

- [ ] **Step 2: Seed the 36 states plus FCT**

`supabase/migrations/20260827120300_gazetteer_seed_states.sql`:

```sql
insert into public.ng_states (code, name) values
  ('AB','Abia'), ('AD','Adamawa'), ('AK','Akwa Ibom'), ('AN','Anambra'),
  ('BA','Bauchi'), ('BY','Bayelsa'), ('BE','Benue'), ('BO','Borno'),
  ('CR','Cross River'), ('DE','Delta'), ('EB','Ebonyi'), ('ED','Edo'),
  ('EK','Ekiti'), ('EN','Enugu'), ('GO','Gombe'), ('IM','Imo'),
  ('JI','Jigawa'), ('KD','Kaduna'), ('KN','Kano'), ('KT','Katsina'),
  ('KE','Kebbi'), ('KO','Kogi'), ('KW','Kwara'), ('LA','Lagos'),
  ('NA','Nasarawa'), ('NI','Niger'), ('OG','Ogun'), ('ON','Ondo'),
  ('OS','Osun'), ('OY','Oyo'), ('PL','Plateau'), ('RI','Rivers'),
  ('SO','Sokoto'), ('TA','Taraba'), ('YO','Yobe'), ('ZA','Zamfara'),
  ('FC','Federal Capital Territory')
on conflict (code) do nothing;
```

- [ ] **Step 3: Source and seed the 774 LGAs**

This dataset must be **sourced, not invented** — a wrong LGA name silently mis-routes a safety alert.

1. Obtain a public 774-LGA dataset keyed by state (for example a Nigeria states-and-LGAs JSON dataset on GitHub, or the NBS/INEC published list). Record the source URL and licence in a comment at the top of the generated file.
2. Generate `supabase/migrations/20260827120500_gazetteer_seed_lgas.sql` as `insert into public.ng_lgas (code, state_code, name) values ... on conflict (code) do nothing;`, with `code` built as `<STATE_CODE>-<slugified name>` (e.g. `LA-ikeja`).
3. The file must end with a self-check so a truncated dataset fails loudly rather than silently degrading the feed:

```sql
do $$
declare n integer;
begin
  select count(*) into n from public.ng_lgas;
  if n <> 774 then
    raise exception 'expected 774 LGAs, found %', n;
  end if;
end $$;
```

- [ ] **Step 4: Seed high-value urban aliases**

`supabase/migrations/20260827120400_gazetteer_seed_aliases.sql`. `alias_norm` is lowercase and whitespace-collapsed; the resolver normalises the same way.

```sql
insert into public.ng_place_aliases (alias_norm, state_code, lga_code) values
  ('ikeja gra',      'LA', 'LA-ikeja'),
  ('allen avenue',   'LA', 'LA-ikeja'),
  ('computer village','LA','LA-ikeja'),
  ('maryland',       'LA', 'LA-ikeja'),
  ('victoria island','LA', 'LA-eti-osa'),
  ('lekki',          'LA', 'LA-eti-osa'),
  ('ajah',           'LA', 'LA-eti-osa'),
  ('ikoyi',          'LA', 'LA-eti-osa'),
  ('yaba',           'LA', 'LA-lagos-mainland'),
  ('surulere',       'LA', 'LA-surulere'),
  ('oshodi',         'LA', 'LA-oshodi-isolo'),
  ('wuse',           'FC', 'FC-municipal'),
  ('wuse ii',        'FC', 'FC-municipal'),
  ('garki',          'FC', 'FC-municipal'),
  ('maitama',        'FC', 'FC-municipal'),
  ('asokoro',        'FC', 'FC-municipal'),
  ('gwarinpa',       'FC', 'FC-municipal'),
  ('kubwa',          'FC', 'FC-bwari'),
  ('sabon gari',     'KN', 'KN-fagge'),
  ('sabon gari',     'KD', 'KD-zaria'),
  ('port harcourt',  'RI', 'RI-port-harcourt'),
  ('gra phase 2',    'RI', 'RI-port-harcourt')
on conflict (alias_norm, state_code, lga_code) do nothing;
```

> The two `sabon gari` rows are deliberate — that is the ambiguity case the resolver's tests exercise. If an LGA code referenced above is absent from the sourced dataset, correct the code to match the dataset rather than inventing an LGA row.

- [ ] **Step 4b: Give `profiles` an area, so push has something to target**

`supabase/migrations/20260827120450_profiles_area.sql`. The push notifier needs to know which LGA a user is in, and `profiles` has no such column today.

```sql
alter table public.profiles
  add column if not exists last_state_code text references public.ng_states(code),
  add column if not exists last_lga_code   text references public.ng_lgas(code),
  add column if not exists area_updated_at timestamptz;

-- Serves the notifier's recipient lookup.
create index if not exists profiles_last_lga_idx
  on public.profiles (last_lga_code)
  where last_lga_code is not null;
```

The client writes these in Task 13; the notifier reads them in Task 16. Existing `profiles` RLS already governs a user updating their own row — do not add a new policy, and do not widen an existing one.

- [ ] **Step 5: Write the SQL assertions**

`supabase/tests/21_gazetteer.sql`:

```sql
\set ON_ERROR_STOP on
do $$
begin
  if (select count(*) from public.ng_states) <> 37 then
    raise exception '36 states + FCT expected';
  end if;
  if (select count(*) from public.ng_lgas) <> 774 then
    raise exception '774 LGAs expected';
  end if;
  if (select count(*) from public.ng_place_aliases where alias_norm = 'sabon gari') < 2 then
    raise exception 'sabon gari must remain ambiguous across states';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_name in ('ng_states','ng_lgas','ng_place_aliases')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'gazetteer must be read-only to authenticated';
  end if;
end $$;
```

- [ ] **Step 6: Apply and run**

```bash
npx supabase db reset --local
bash supabase/tests/run.sh   # runs 21_gazetteer.sql and every other assertion file
```

Expected: both succeed. A failure here means the LGA dataset is incomplete — fix the data, do not relax the assertion.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/2026082712020*.sql supabase/migrations/2026082712030*.sql supabase/migrations/2026082712040*.sql supabase/migrations/20260827120500_gazetteer_seed_lgas.sql supabase/tests/21_gazetteer.sql
git commit -m "feat(feed): Nigerian state/LGA gazetteer with alias resolution table"
```

---

### Task 7: `news_items` migration

**Files:**
- Create: `supabase/migrations/20260827120600_news_items.sql`
- Test: `supabase/tests/22_news_items_rls.sql`

**Interfaces:**
- Consumes: `ng_states`, `ng_lgas` (Task 6); `news_items_raw` (Task 4).
- Produces: `public.news_items`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260827120600_news_items.sql`:

```sql
create table if not exists public.news_items (
  id             uuid primary key default gen_random_uuid(),
  raw_id         uuid not null unique references public.news_items_raw(id) on delete cascade,
  headline       text not null,
  summary        text not null,
  advice         text,
  category       text not null,
  severity       text not null check (severity in ('info','caution','warning','critical')),
  confidence     numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  state_code     text references public.ng_states(code),
  lga_code       text references public.ng_lgas(code),
  lat            double precision,
  lng            double precision,
  is_national    boolean not null default false,
  published_at   timestamptz not null,
  source_name    text not null,
  source_url     text not null,
  unpublished_at timestamptz,
  created_at     timestamptz not null default now()
);

-- Written to serve get_area_feed's actual predicates. The previous spec shipped
-- an index built for a query it did not serve; this is that mistake avoided.
create index if not exists news_items_area_idx
  on public.news_items (state_code, lga_code, published_at desc)
  where unpublished_at is null;

create index if not exists news_items_national_idx
  on public.news_items (is_national, published_at desc)
  where unpublished_at is null;

alter table public.news_items enable row level security;

create policy news_items_read on public.news_items
  for select to authenticated
  using (unpublished_at is null);

grant select on public.news_items to authenticated;
revoke insert, update, delete on public.news_items from anon, authenticated;
```

> **On `lat` / `lng`:** these columns are created but **nothing in this plan populates them**, and no query reads them. The spec stores coordinates "opportunistically" for radius sorting; the news path deliberately does not geocode, because inventing a point for "bandits attacked Birnin Gwari LGA" claims a precision the source does not have. The columns exist so the community half — whose `incident_clusters` rows carry real centroids — can fill them through the same row shape. Do not add a geocoding call to make them non-null.

- [ ] **Step 2: Write the RLS assertions**

`supabase/tests/22_news_items_rls.sql`:

```sql
\set ON_ERROR_STOP on
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_name = 'news_items'
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'a client must never be able to publish into the feed';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'news_items' and policyname = 'news_items_read'
  ) then
    raise exception 'read policy missing';
  end if;
end $$;
```

- [ ] **Step 3: Apply and run**

```bash
npx supabase db reset --local
bash supabase/tests/run.sh   # runs 22_news_items_rls.sql and every other assertion file
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827120600_news_items.sql supabase/tests/22_news_items_rls.sql
git commit -m "feat(feed): news_items table, area indexes, read-only RLS"
```

---

### Task 8: The publish gate (pure function)

**Files:**
- Create: `supabase/functions/enrich-news/gate.ts`
- Test: `supabase/functions/enrich-news/gate_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export interface Verdict {
  is_security_relevant: boolean;
  category: string; severity: string;
  locations: { state: string; lga: string | null; landmark: string | null }[];
  headline: string; summary: string; advice: string | null; confidence: number;
}
export interface ResolvedLocation { state_code: string; lga_code: string | null }
export type GateResult =
  | { publish: true; reason: null }
  | { publish: false; reason: "not_relevant" | "low_confidence" | "no_location" | "empty_copy" };
export function evaluateGate(v: Verdict, resolved: ResolvedLocation[]): GateResult;
export const CONFIDENCE_FLOOR = 0.7;
```

- [ ] **Step 1: Write the failing test**

`supabase/functions/enrich-news/gate_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { evaluateGate, type Verdict, type ResolvedLocation } from "./gate.ts";

const ok: Verdict = {
  is_security_relevant: true,
  category: "armed_robbery",
  severity: "warning",
  locations: [{ state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" }],
  headline: "Robbery repelled on Allen Avenue",
  summary: "Police repelled an attempted robbery in Ikeja overnight.",
  advice: "Avoid the area until traffic clears.",
  confidence: 0.9,
};
const resolved: ResolvedLocation[] = [{ state_code: "LA", lga_code: "LA-ikeja" }];

Deno.test("publishes a confident, relevant, located item", () => {
  assertEquals(evaluateGate(ok, resolved), { publish: true, reason: null });
});

Deno.test("rejects an irrelevant item", () => {
  assertEquals(
    evaluateGate({ ...ok, is_security_relevant: false }, resolved).reason,
    "not_relevant",
  );
});

Deno.test("rejects below the confidence floor", () => {
  assertEquals(evaluateGate({ ...ok, confidence: 0.69 }, resolved).reason, "low_confidence");
});

Deno.test("accepts exactly at the confidence floor", () => {
  assertEquals(evaluateGate({ ...ok, confidence: 0.7 }, resolved).publish, true);
});

Deno.test("rejects when nothing resolved — fail closed", () => {
  assertEquals(evaluateGate(ok, []).reason, "no_location");
});

Deno.test("a state-only resolution is enough", () => {
  assertEquals(
    evaluateGate(ok, [{ state_code: "LA", lga_code: null }]).publish,
    true,
  );
});

Deno.test("rejects blank copy so an empty card never reaches the feed", () => {
  assertEquals(evaluateGate({ ...ok, headline: "   " }, resolved).reason, "empty_copy");
  assertEquals(evaluateGate({ ...ok, summary: "" }, resolved).reason, "empty_copy");
});

Deno.test("relevance is checked before confidence", () => {
  assertEquals(
    evaluateGate({ ...ok, is_security_relevant: false, confidence: 0.1 }, []).reason,
    "not_relevant",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/enrich-news/gate_test.ts
```

Expected: FAIL — `Module not found ... gate.ts`.

- [ ] **Step 3: Write the implementation**

`supabase/functions/enrich-news/gate.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/enrich-news/gate_test.ts
```

Expected: `ok | 8 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enrich-news/gate.ts supabase/functions/enrich-news/gate_test.ts
git commit -m "feat(feed): fail-closed publish gate for enriched news items"
```

---

### Task 9: Claude classification with an injectable client

Finding I7 on the previous branch was deferred precisely because `assessQuality` had no injectable seam, leaving its network, timeout, and refusal branches verified by reading only. That seam is built here from the start.

**Files:**
- Create: `supabase/functions/enrich-news/prompt.ts`
- Create: `supabase/functions/enrich-news/classify.ts`
- Test: `supabase/functions/enrich-news/classify_test.ts`

**Interfaces:**
- Consumes: `Verdict` (Task 8).
- Produces:
```ts
export interface ModelClient { create(article: ArticleInput): Promise<ModelResponse> }
export interface ArticleInput { title: string; summary: string; sourceName: string; publishedAt: string | null }
export interface ModelResponse { stop_reason: string | null; text: string | null }
export type ClassifyResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; failure: "refusal" | "transport" | "malformed" | "invalid" };
export async function classify(article: ArticleInput, client: ModelClient): Promise<ClassifyResult>;
export function makeAnthropicClient(apiKey: string): ModelClient;
```

- [ ] **Step 1: Write the system prompt module**

`supabase/functions/enrich-news/prompt.ts`:

```ts
/** Frozen prefix. Keep this stable — volatile content belongs in the user turn. */
export const SYSTEM_PROMPT = `
You classify Nigerian news articles for a personal-safety app used by people in Nigeria.

Return ONE JSON object matching the provided schema. No prose.

RELEVANCE
Set is_security_relevant true only for events affecting a person's physical
safety in a specific place: armed robbery, kidnapping, banditry, unrest or
protest, road incidents, fire, flood, cult clashes, notable police or military
activity, terrorism, herder-farmer conflict, or widespread fraud with a
physical component. Sport, politics, celebrity, business and opinion are false.

SEVERITY
critical - active and life-threatening at a named place, right now.
warning  - confirmed recent incident at a named place, risk ongoing.
caution  - elevated risk or advisory: planned protest, road closure, a pattern.
info     - context, arrests, policy, official statements.
When torn between two levels, choose the LOWER one.

LOCATION
Extract every Nigerian place named. "state" must be a Nigerian state name or
"Federal Capital Territory". "lga" is the Local Government Area when the text
names or clearly implies one, else null. "landmark" is a road, district or
building when named, else null. Never guess a state you were not given
evidence for; an empty locations array is correct when the article names no
Nigerian place.

EDITORIAL RULES
- headline: at most 70 characters, plain and factual. No sensational verbs, no
  ALL CAPS, no exclamation marks.
- summary: one or two sentences. Say what happened and what it means for
  someone nearby.
- Do NOT include graphic detail: no descriptions of injuries, mutilation or
  corpses.
- Do NOT name suspects, victims, or their families.
- advice: one short actionable line ONLY when the article itself supports it.
  Otherwise null. Never invent safety advice.
- confidence: your confidence that this classification and location are correct.

Reports of events older than roughly seven days are usually info at most.
`.trim();

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_security_relevant", "category", "severity",
    "locations", "headline", "summary", "advice", "confidence",
  ],
  properties: {
    is_security_relevant: { type: "boolean" },
    category: {
      type: "string",
      enum: [
        "armed_robbery", "kidnapping", "banditry", "unrest_protest",
        "road_incident", "fire", "flood", "cult_clash", "police_activity",
        "fraud_scam", "terrorism", "herder_farmer", "other",
      ],
    },
    severity: { type: "string", enum: ["info", "caution", "warning", "critical"] },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["state", "lga", "landmark"],
        properties: {
          state: { type: "string" },
          lga: { type: ["string", "null"] },
          landmark: { type: ["string", "null"] },
        },
      },
    },
    headline: { type: "string" },
    summary: { type: "string" },
    advice: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
} as const;
```

- [ ] **Step 2: Write the failing test**

`supabase/functions/enrich-news/classify_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { classify, type ArticleInput, type ModelClient } from "./classify.ts";

const article: ArticleInput = {
  title: "Robbery on Allen Avenue",
  summary: "Police repelled an attack in Ikeja.",
  sourceName: "Punch",
  publishedAt: "2026-08-27T07:30:00.000Z",
};

const goodJson = JSON.stringify({
  is_security_relevant: true,
  category: "armed_robbery",
  severity: "warning",
  locations: [{ state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" }],
  headline: "Robbery repelled on Allen Avenue",
  summary: "Police repelled an attempted robbery in Ikeja overnight.",
  advice: null,
  confidence: 0.88,
});

const client = (r: Partial<{ stop_reason: string; text: string }> | Error): ModelClient => ({
  create: () => r instanceof Error ? Promise.reject(r) : Promise.resolve({
    stop_reason: r.stop_reason ?? "end_turn",
    text: r.text ?? null,
  }),
});

Deno.test("parses a well-formed verdict", async () => {
  const res = await classify(article, client({ text: goodJson }));
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.verdict.severity, "warning");
    assertEquals(res.verdict.locations[0].lga, "Ikeja");
  }
});

Deno.test("a refusal is reported as refusal, never as a crash", async () => {
  const res = await classify(article, client({ stop_reason: "refusal", text: null }));
  assertEquals(res, { ok: false, failure: "refusal" });
});

Deno.test("refusal is detected before content is read", async () => {
  // stop_reason wins even when text happens to be present
  const res = await classify(article, client({ stop_reason: "refusal", text: goodJson }));
  assertEquals(res, { ok: false, failure: "refusal" });
});

Deno.test("a network error is transport, not malformed", async () => {
  const res = await classify(article, client(new Error("ECONNRESET")));
  assertEquals(res, { ok: false, failure: "transport" });
});

Deno.test("a timeout is transport", async () => {
  const res = await classify(article, client(new DOMException("aborted", "AbortError")));
  assertEquals(res, { ok: false, failure: "transport" });
});

Deno.test("non-JSON text is malformed", async () => {
  const res = await classify(article, client({ text: "I cannot help with that." }));
  assertEquals(res, { ok: false, failure: "malformed" });
});

Deno.test("missing text block is malformed", async () => {
  const res = await classify(article, client({ text: null }));
  assertEquals(res, { ok: false, failure: "malformed" });
});

Deno.test("JSON missing a required field is invalid", async () => {
  const res = await classify(article, client({ text: JSON.stringify({ severity: "warning" }) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("an out-of-range confidence is invalid", async () => {
  const bad = JSON.parse(goodJson);
  bad.confidence = 1.7;
  const res = await classify(article, client({ text: JSON.stringify(bad) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("an unknown severity is invalid", async () => {
  const bad = JSON.parse(goodJson);
  bad.severity = "apocalyptic";
  const res = await classify(article, client({ text: JSON.stringify(bad) }));
  assertEquals(res, { ok: false, failure: "invalid" });
});

Deno.test("classify never throws, whatever the client does", async () => {
  const hostile: ModelClient = { create: () => { throw new Error("sync throw"); } };
  const res = await classify(article, hostile);
  assertEquals(res.ok, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/enrich-news/classify_test.ts
```

Expected: FAIL — `Module not found ... classify.ts`.

- [ ] **Step 4: Write the implementation**

`supabase/functions/enrich-news/classify.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt.ts";
import type { Verdict } from "./gate.ts";

export const MODEL = "claude-haiku-4-5";
export const MAX_TOKENS = 1000;
export const TIMEOUT_MS = 8000;

const SEVERITIES = ["info", "caution", "warning", "critical"];
const CATEGORIES = [
  "armed_robbery", "kidnapping", "banditry", "unrest_protest", "road_incident",
  "fire", "flood", "cult_clash", "police_activity", "fraud_scam", "terrorism",
  "herder_farmer", "other",
];

export interface ArticleInput {
  title: string;
  summary: string;
  sourceName: string;
  publishedAt: string | null;
}

export interface ModelResponse {
  stop_reason: string | null;
  text: string | null;
}

export interface ModelClient {
  create(article: ArticleInput): Promise<ModelResponse>;
}

export type ClassifyResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; failure: "refusal" | "transport" | "malformed" | "invalid" };

function validate(raw: unknown): Verdict | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;

  if (typeof v.is_security_relevant !== "boolean") return null;
  if (typeof v.category !== "string" || !CATEGORIES.includes(v.category)) return null;
  if (typeof v.severity !== "string" || !SEVERITIES.includes(v.severity)) return null;
  if (typeof v.headline !== "string" || typeof v.summary !== "string") return null;
  if (v.advice !== null && typeof v.advice !== "string") return null;
  if (typeof v.confidence !== "number" || !(v.confidence >= 0 && v.confidence <= 1)) return null;
  if (!Array.isArray(v.locations)) return null;

  for (const loc of v.locations) {
    if (typeof loc !== "object" || loc === null) return null;
    const l = loc as Record<string, unknown>;
    if (typeof l.state !== "string") return null;
    if (l.lga !== null && typeof l.lga !== "string") return null;
    if (l.landmark !== null && typeof l.landmark !== "string") return null;
  }

  return v as unknown as Verdict;
}

/** Never throws. Every failure is a typed result the caller can route on. */
export async function classify(
  article: ArticleInput,
  client: ModelClient,
): Promise<ClassifyResult> {
  let res: ModelResponse;
  try {
    res = await client.create(article);
  } catch {
    return { ok: false, failure: "transport" };
  }

  // A refusal arrives as HTTP 200 with no exception. Check stop_reason BEFORE
  // touching content, or we read an empty block and misreport the cause.
  if (res.stop_reason === "refusal") return { ok: false, failure: "refusal" };
  if (typeof res.text !== "string" || res.text.trim() === "") {
    return { ok: false, failure: "malformed" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return { ok: false, failure: "malformed" };
  }

  const verdict = validate(parsed);
  if (!verdict) return { ok: false, failure: "invalid" };
  return { ok: true, verdict };
}

/**
 * claude-haiku-4-5 is a pre-4.6 model: no output_config.effort (it errors), no
 * thinking, no server-side fallbacks. temperature IS accepted here, unlike on
 * 4.6+ models.
 */
export function makeAnthropicClient(apiKey: string): ModelClient {
  const anthropic = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    async create(article: ArticleInput): Promise<ModelResponse> {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{
          role: "user",
          content: [
            `Source: ${article.sourceName}`,
            `Published: ${article.publishedAt ?? "unknown"}`,
            `Title: ${article.title}`,
            `Body: ${article.summary}`,
          ].join("\n"),
        }],
      });

      const block = response.content.find((b) => b.type === "text");
      return {
        stop_reason: response.stop_reason,
        text: block && block.type === "text" ? block.text : null,
      };
    },
  };
}
```

> **Verified during execution:** `output_config` is absent from `@anthropic-ai/sdk` types up to and including 0.71.x, and present in 0.120.0 — so the pin is `^0.120.0` and no `as never` cast is needed. Do not raise it to 0.121.0 yet: Deno's 24-hour minimum-dependency-age policy rejects it until it ages in.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/enrich-news/classify_test.ts
npx deno@2 check --config supabase/functions/deno.json supabase/functions/enrich-news/classify.ts
```

Expected: `ok | 11 passed | 0 failed`, and a clean type check.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/enrich-news/prompt.ts supabase/functions/enrich-news/classify.ts supabase/functions/enrich-news/classify_test.ts
git commit -m "feat(feed): Claude Haiku classification with injectable client and typed failures"
```

---

### Task 10: Gazetteer resolution

**Files:**
- Create: `supabase/functions/_shared/gazetteer.ts`
- Test: `supabase/functions/_shared/gazetteer_test.ts`

**Interfaces:**
- Consumes: `Verdict["locations"]` (Task 8).
- Produces:
```ts
export interface GazetteerTables {
  states: { code: string; name: string }[];
  lgas: { code: string; state_code: string; name: string }[];
  aliases: { alias_norm: string; state_code: string; lga_code: string | null }[];
}
export function normalisePlace(s: string): string;
export function resolveLocations(
  locations: { state: string; lga: string | null; landmark: string | null }[],
  tables: GazetteerTables,
): ResolvedLocation[];
```

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/gazetteer_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { normalisePlace, resolveLocations, type GazetteerTables } from "./gazetteer.ts";

const tables: GazetteerTables = {
  states: [
    { code: "LA", name: "Lagos" },
    { code: "KN", name: "Kano" },
    { code: "KD", name: "Kaduna" },
    { code: "FC", name: "Federal Capital Territory" },
  ],
  lgas: [
    { code: "LA-ikeja", state_code: "LA", name: "Ikeja" },
    { code: "LA-eti-osa", state_code: "LA", name: "Eti-Osa" },
    { code: "KN-fagge", state_code: "KN", name: "Fagge" },
    { code: "KD-zaria", state_code: "KD", name: "Zaria" },
    { code: "FC-municipal", state_code: "FC", name: "Municipal" },
  ],
  aliases: [
    { alias_norm: "allen avenue", state_code: "LA", lga_code: "LA-ikeja" },
    { alias_norm: "wuse ii", state_code: "FC", lga_code: "FC-municipal" },
    { alias_norm: "sabon gari", state_code: "KN", lga_code: "KN-fagge" },
    { alias_norm: "sabon gari", state_code: "KD", lga_code: "KD-zaria" },
  ],
};

Deno.test("normalises case, whitespace and punctuation", () => {
  assertEquals(normalisePlace("  Allen   Avenue,  "), "allen avenue");
  assertEquals(normalisePlace("Eti-Osa"), "eti-osa");
});

Deno.test("resolves an exact state and LGA", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: "Ikeja", landmark: null }], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("resolves state-only when the LGA is absent", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: null, landmark: null }], tables),
    [{ state_code: "LA", lga_code: null }],
  );
});

Deno.test("a landmark alias supplies the LGA", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: null, landmark: "Allen Avenue" }], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("state context disambiguates Sabon Gari", () => {
  assertEquals(
    resolveLocations([{ state: "Kano", lga: null, landmark: "Sabon Gari" }], tables),
    [{ state_code: "KN", lga_code: "KN-fagge" }],
  );
  assertEquals(
    resolveLocations([{ state: "Kaduna", lga: null, landmark: "Sabon Gari" }], tables),
    [{ state_code: "KD", lga_code: "KD-zaria" }],
  );
});

Deno.test("Abuja maps to the FCT", () => {
  assertEquals(
    resolveLocations([{ state: "Abuja", lga: null, landmark: "Wuse II" }], tables),
    [{ state_code: "FC", lga_code: "FC-municipal" }],
  );
});

Deno.test("an unknown state resolves to nothing — never a guess", () => {
  assertEquals(
    resolveLocations([{ state: "Atlantis", lga: "Nowhere", landmark: null }], tables),
    [],
  );
});

Deno.test("an unknown LGA still yields the state", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: "Nowhere", landmark: null }], tables),
    [{ state_code: "LA", lga_code: null }],
  );
});

Deno.test("duplicate resolutions are collapsed", () => {
  assertEquals(
    resolveLocations([
      { state: "Lagos", lga: "Ikeja", landmark: null },
      { state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" },
    ], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("an empty locations array resolves to empty", () => {
  assertEquals(resolveLocations([], tables), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/gazetteer_test.ts
```

Expected: FAIL — `Module not found ... gazetteer.ts`.

- [ ] **Step 3: Write the implementation**

`supabase/functions/_shared/gazetteer.ts`:

```ts
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
  "f.c.t": "federal capital territory",
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/_shared/gazetteer_test.ts
```

Expected: `ok | 10 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/gazetteer.ts supabase/functions/_shared/gazetteer_test.ts
git commit -m "feat(feed): Nigerian place-name resolution with state-context disambiguation"
```

---

### Task 11: `enrich-news` Edge Function

**Files:**
- Create: `supabase/functions/enrich-news/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `classify`, `makeAnthropicClient` (Task 9); `evaluateGate` (Task 8); `resolveLocations` (Task 10).
- Produces: an HTTP endpoint that drains `news_items_raw` into `news_items`.

- [ ] **Step 1: Write the entrypoint**

`supabase/functions/enrich-news/index.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { classify, makeAnthropicClient } from "./classify.ts";
import { evaluateGate } from "./gate.ts";
import { resolveLocations, type GazetteerTables } from "../_shared/gazetteer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const BATCH_SIZE = 40;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;

Deno.serve(async () => {
  if (!ANTHROPIC_API_KEY) {
    console.error("enrich-news: ANTHROPIC_API_KEY not configured");
    return new Response("not configured", { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const model = makeAnthropicClient(ANTHROPIC_API_KEY);

  const [statesRes, lgasRes, aliasRes] = await Promise.all([
    db.from("ng_states").select("code, name"),
    db.from("ng_lgas").select("code, state_code, name"),
    db.from("ng_place_aliases").select("alias_norm, state_code, lga_code"),
  ]);
  const tables: GazetteerTables = {
    states: statesRes.data ?? [],
    lgas: lgasRes.data ?? [],
    aliases: aliasRes.data ?? [],
  };

  const { data: pending, error } = await db
    .from("news_items_raw")
    .select("id, url, title, raw_summary, published_at, fetched_at, attempts, source_id")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("fetched_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("enrich-news: queue read failed", error);
    return new Response("queue read failed", { status: 500 });
  }

  const sourceNames = new Map<string, string>();
  const { data: sources } = await db.from("news_sources").select("id, name");
  for (const s of sources ?? []) sourceNames.set(s.id, s.name);

  const stats = { published: 0, rejected: 0, failed: 0 };

  async function handle(row: Record<string, any>) {
    const sourceName = sourceNames.get(row.source_id) ?? "Unknown";

    const result = await classify({
      title: row.title,
      summary: row.raw_summary,
      sourceName,
      publishedAt: row.published_at,
    }, model);

    if (!result.ok) {
      // A refusal is terminal — retrying identical content just burns budget.
      if (result.failure === "refusal") {
        stats.rejected++;
        await db.from("news_items_raw")
          .update({ status: "rejected", last_error: "refusal" })
          .eq("id", row.id);
        return;
      }
      const attempts = (row.attempts ?? 0) + 1;
      stats.failed++;
      await db.from("news_items_raw")
        .update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: result.failure,
        })
        .eq("id", row.id);
      return;
    }

    const resolved = resolveLocations(result.verdict.locations, tables);
    const gate = evaluateGate(result.verdict, resolved);

    if (!gate.publish) {
      stats.rejected++;
      await db.from("news_items_raw")
        .update({ status: "rejected", last_error: gate.reason })
        .eq("id", row.id);
      return;
    }

    const primary = resolved[0];
    const { error: insErr } = await db.from("news_items").insert({
      raw_id: row.id,
      headline: result.verdict.headline,
      summary: result.verdict.summary,
      advice: result.verdict.advice,
      category: result.verdict.category,
      severity: result.verdict.severity,
      confidence: result.verdict.confidence,
      state_code: primary.state_code,
      lga_code: primary.lga_code,
      is_national: resolved.length > 2,
      published_at: row.published_at ?? row.fetched_at,
      source_name: sourceName,
      source_url: row.url,
    });

    if (insErr) {
      // Do not mark enriched on a write failure — the row must remain claimable.
      const attempts = (row.attempts ?? 0) + 1;
      stats.failed++;
      await db.from("news_items_raw")
        .update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: `insert: ${insErr.message}`,
        })
        .eq("id", row.id);
      return;
    }

    stats.published++;
    await db.from("news_items_raw").update({ status: "enriched" }).eq("id", row.id);
  }

  const queue = [...(pending ?? [])];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (row) await handle(row);
    }
  });
  await Promise.all(workers);

  console.log(`enrich-news: ${JSON.stringify(stats)}`);
  return Response.json(stats);
});
```

> The `select` list must name every column this handler reads (`url` included, since it becomes `source_url`). PostgREST returns `undefined` for unselected columns rather than erroring, so a missing column here would silently write nulls.

- [ ] **Step 2: Register the function**

Append to `supabase/config.toml`:

```toml
[functions.enrich-news]
enabled = true
verify_jwt = true
import_map = "./functions/deno.json"
entrypoint = "./functions/enrich-news/index.ts"
```

- [ ] **Step 3: Type-check**

```bash
npx deno@2 check --config supabase/functions/deno.json supabase/functions/enrich-news/index.ts
```

Expected: no errors. Fix any column referenced but not selected.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enrich-news/index.ts supabase/config.toml
git commit -m "feat(feed): enrich-news function draining the raw queue into news_items"
```

---

### Task 12: Feed RPC with the community seam

**Files:**
- Create: `supabase/migrations/20260827120700_feed_rpc.sql`
- Test: `supabase/tests/23_feed_rpc.sql`

**Interfaces:**
- Consumes: `news_items` (Task 7).
- Produces: `public.get_area_feed(p_state_code text, p_lga_code text, p_limit int, p_before timestamptz)`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260827120700_feed_rpc.sql`:

```sql
-- Shared row shape. Both halves of the feed conform to it, which is what makes
-- the community half swappable without touching the client.
create type public.feed_row as (
  kind         text,
  id           uuid,
  headline     text,
  summary      text,
  advice       text,
  category     text,
  severity     text,
  occurred_at  timestamptz,
  state_code   text,
  lga_code     text,
  lat          double precision,
  lng          double precision,
  source_label text,
  deep_link    text,
  score        double precision
);

create or replace function public.feed_severity_weight(p_severity text)
returns double precision language sql immutable as $$
  select case p_severity
    when 'critical' then 4.0
    when 'warning'  then 3.0
    when 'caution'  then 2.0
    else 1.0
  end;
$$;

-- Exponential decay, half-life exactly 12 hours.
create or replace function public.feed_recency_decay(p_at timestamptz)
returns double precision language sql stable as $$
  select power(0.5, extract(epoch from (now() - p_at)) / 43200.0);
$$;

create or replace function public.feed_proximity_weight(
  p_item_state text, p_item_lga text, p_user_state text, p_user_lga text
) returns double precision language sql immutable as $$
  select case
    when p_user_lga is not null and p_item_lga is not null and p_item_lga = p_user_lga then 1.0
    when p_user_state is not null and p_item_state = p_user_state then 0.6
    else 0.3
  end;
$$;

create or replace function public.get_area_news_items(
  p_state_code text, p_lga_code text, p_limit integer, p_before timestamptz
) returns setof public.feed_row
language sql stable security invoker as $$
  select
    'news'::text,
    n.id,
    n.headline,
    n.summary,
    n.advice,
    n.category,
    n.severity,
    n.published_at,
    n.state_code,
    n.lga_code,
    n.lat,
    n.lng,
    n.source_name,
    n.source_url,
    public.feed_severity_weight(n.severity)
      * public.feed_recency_decay(n.published_at)
      * public.feed_proximity_weight(n.state_code, n.lga_code, p_state_code, p_lga_code)
  from public.news_items n
  where n.unpublished_at is null
    and (p_before is null or n.published_at < p_before)
    and (
      n.is_national
      or p_state_code is null
      or n.state_code = p_state_code
    )
  order by n.published_at desc
  limit greatest(p_limit, 0);
$$;

-- SEAM: returns nothing until feat/ai-features lands and its I4 column lockdown
-- is closed. Replacing this body with the incident_clusters query is the ONLY
-- change needed to light up the community half — no client or RPC change.
create or replace function public.get_area_community_items(
  p_state_code text, p_lga_code text, p_limit integer, p_before timestamptz
) returns setof public.feed_row
language sql stable security invoker as $$
  select * from (values (null::text, null::uuid, null::text, null::text, null::text,
    null::text, null::text, null::timestamptz, null::text, null::text,
    null::double precision, null::double precision, null::text, null::text,
    null::double precision)) as empty_seam
  where false;
$$;

create or replace function public.get_area_feed(
  p_state_code text default null,
  p_lga_code   text default null,
  p_limit      integer default 20,
  p_before     timestamptz default null
) returns setof public.feed_row
language sql stable security invoker as $$
  select * from (
    select * from public.get_area_news_items(p_state_code, p_lga_code, p_limit, p_before)
    union all
    select * from public.get_area_community_items(p_state_code, p_lga_code, p_limit, p_before)
  ) merged
  -- occurred_at is the stable tiebreak so pagination cannot repeat or skip rows
  order by merged.score desc, merged.occurred_at desc, merged.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.get_area_feed(text, text, integer, timestamptz) from public;
grant execute on function public.get_area_feed(text, text, integer, timestamptz) to authenticated;
```

- [ ] **Step 2: Write the SQL assertions**

`supabase/tests/23_feed_rpc.sql`:

```sql
\set ON_ERROR_STOP on
begin;

insert into public.news_sources (name, rss_url) values ('T', 'https://t.ng/feed')
  on conflict (rss_url) do nothing;

insert into public.news_items_raw (source_id, url, url_hash, title, status)
select id, 'https://t.ng/1', 'rpc-h1', 'near', 'enriched' from public.news_sources where name='T';
insert into public.news_items_raw (source_id, url, url_hash, title, status)
select id, 'https://t.ng/2', 'rpc-h2', 'far',  'enriched' from public.news_sources where name='T';

insert into public.news_items
  (raw_id, headline, summary, category, severity, confidence, state_code, lga_code,
   published_at, source_name, source_url)
select r.id, 'Near caution', 's', 'road_incident', 'caution', 0.9, 'LA', 'LA-ikeja',
       now(), 'T', 'https://t.ng/1'
from public.news_items_raw r where r.url_hash = 'rpc-h1';

insert into public.news_items
  (raw_id, headline, summary, category, severity, confidence, state_code, lga_code,
   published_at, source_name, source_url)
select r.id, 'Far critical', 's', 'terrorism', 'critical', 0.9, 'KN', 'KN-fagge',
       now(), 'T', 'https://t.ng/2'
from public.news_items_raw r where r.url_hash = 'rpc-h2';

do $$
declare first_headline text; n integer;
begin
  -- proximity must outrank raw severity for a same-LGA item
  select headline into first_headline
  from public.get_area_feed('LA', 'LA-ikeja', 10, null) limit 1;
  if first_headline <> 'Near caution' then
    raise exception 'expected the same-LGA item first, got %', first_headline;
  end if;

  -- the community seam contributes nothing yet, and does not break the union
  select count(*) into n from public.get_area_community_items('LA','LA-ikeja',10,null);
  if n <> 0 then raise exception 'community seam must be empty until spec 1 lands'; end if;

  -- a user with no location still receives a feed
  select count(*) into n from public.get_area_feed(null, null, 10, null);
  if n < 1 then raise exception 'location-less users must still get national items'; end if;

  -- recency decay is finite and positive
  if public.feed_recency_decay(now() - interval '12 hours') not between 0.49 and 0.51 then
    raise exception 'half-life must be 12 hours';
  end if;
end $$;

rollback;
```

- [ ] **Step 3: Apply and run**

```bash
npx supabase db reset --local
bash supabase/tests/run.sh   # runs 23_feed_rpc.sql and every other assertion file
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827120700_feed_rpc.sql supabase/tests/23_feed_rpc.sql
git commit -m "feat(feed): ranked feed RPC with empty community seam"
```

---

### Task 13: Client data layer and hook

**Files:**
- Create: `src/lib/feed.ts`
- Create: `src/hooks/useSafetyFeed.ts`

**Interfaces:**
- Consumes: `get_area_feed` (Task 12); existing `supabase` client at `src/lib/supabase.ts`.
- Produces:
```ts
export interface FeedRow {
  kind: 'news' | 'community';
  id: string; headline: string; summary: string; advice: string | null;
  category: string; severity: FeedSeverity; occurred_at: string;
  state_code: string | null; lga_code: string | null;
  source_label: string; deep_link: string | null;
}
export type FeedSeverity = 'info' | 'caution' | 'warning' | 'critical';
export function fetchAreaFeed(p: { stateCode: string | null; lgaCode: string | null; limit: number; before?: string | null }): Promise<FeedRow[]>;
export function useSafetyFeed(limit?: number): {
  items: FeedRow[]; loading: boolean; refreshing: boolean;
  isNationalOnly: boolean; error: string | null;
  refresh: () => Promise<void>; loadMore: () => Promise<void>;
};
```

- [ ] **Step 1: Write the data layer**

`src/lib/feed.ts`:

```ts
import { supabase } from './supabase';

export type FeedSeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface FeedRow {
  kind        : 'news' | 'community';
  id          : string;
  headline    : string;
  summary     : string;
  advice      : string | null;
  category    : string;
  severity    : FeedSeverity;
  occurred_at : string;
  state_code  : string | null;
  lga_code    : string | null;
  source_label: string;
  deep_link   : string | null;
}

export async function fetchAreaFeed(p: {
  stateCode: string | null;
  lgaCode  : string | null;
  limit    : number;
  before  ?: string | null;
}): Promise<FeedRow[]> {
  const { data, error } = await supabase.rpc('get_area_feed', {
    p_state_code: p.stateCode,
    p_lga_code  : p.lgaCode,
    p_limit     : p.limit,
    p_before    : p.before ?? null,
  });
  if (error) throw error;
  return (data ?? []) as FeedRow[];
}
```

- [ ] **Step 2: Write the hook**

`src/hooks/useSafetyFeed.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { fetchAreaFeed, type FeedRow } from '../lib/feed';
import { supabase } from '../lib/supabase';

/**
 * Resolves the user's state/LGA from the device, then reads the ranked feed.
 *
 * Denied permission is a normal path, not an error: the previous AI spec
 * shipped a bug where a location-less user was walled out entirely. Here, no
 * location simply means the national feed.
 */
export function useSafetyFeed(limit = 20) {
  const [items, setItems]           = useState<FeedRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isNationalOnly, setNational] = useState(false);

  const area = useRef<{ stateCode: string | null; lgaCode: string | null }>({
    stateCode: null, lgaCode: null,
  });

  const resolveArea = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') { setNational(true); return; }

      const pos = await Location.getLastKnownPositionAsync()
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!pos) { setNational(true); return; }

      const [place] = await Location.reverseGeocodeAsync({
        latitude : pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (!place?.region) { setNational(true); return; }

      const { data } = await supabase
        .from('ng_states').select('code').ilike('name', place.region).maybeSingle();
      if (!data?.code) { setNational(true); return; }

      area.current.stateCode = data.code;
      setNational(false);

      if (place.subregion) {
        const { data: lga } = await supabase
          .from('ng_lgas').select('code')
          .eq('state_code', data.code).ilike('name', place.subregion).maybeSingle();
        area.current.lgaCode = lga?.code ?? null;
      }

      // Persist the area so the push notifier knows who is in this LGA.
      // getSession(), never getUser() — this project has been bitten by that.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        void supabase.from('profiles').update({
          last_state_code : area.current.stateCode,
          last_lga_code   : area.current.lgaCode,
          area_updated_at : new Date().toISOString(),
        }).eq('id', session.user.id);
      }
    } catch {
      // Any geo failure degrades to the national feed rather than an error state.
      setNational(true);
    }
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await fetchAreaFeed({ ...area.current, limit });
      setItems(rows);
      setError(null);
    } catch (e) {
      // Keep whatever is already on screen; a safety feed must not go blank.
      setError(e instanceof Error ? e.message : 'Could not load the feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [limit]);

  const refresh = useCallback(async () => {
    await resolveArea();
    await load('refresh');
  }, [resolveArea, load]);

  const loadMore = useCallback(async () => {
    if (items.length === 0) return;
    const before = items[items.length - 1].occurred_at;
    try {
      const more = await fetchAreaFeed({ ...area.current, limit, before });
      if (more.length > 0) setItems((prev) => [...prev, ...more]);
    } catch { /* keep the current page */ }
  }, [items, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await resolveArea();
      if (!cancelled) await load('initial');
    })();

    const channel = supabase
      .channel('news_items_feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        () => { void load('refresh'); })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [resolveArea, load]);

  return { items, loading, refreshing, isNationalOnly, error, refresh, loadMore };
}
```

- [ ] **Step 3: Verify no new type errors**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `9` — the documented baseline, unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/feed.ts src/hooks/useSafetyFeed.ts
git commit -m "feat(feed): client data layer and useSafetyFeed hook with graceful geo degradation"
```

---

### Task 14: Rewire `SafetyFeed` and mount it on Home

**Files:**
- Modify: `src/components/SafetyFeed.tsx` (full rewrite of the data path; styles preserved)
- Create: `src/components/feed/FeedEmptyState.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useSafetyFeed`, `FeedRow` (Task 13).
- Produces: `<SafetyFeed limit?: number onSeeAll?: () => void />`.

- [ ] **Step 1: Create the empty state**

`src/components/feed/FeedEmptyState.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export const FeedEmptyState = ({ nationalOnly }: { nationalOnly: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="shield-check-outline" size={32} color={colors.text.secondary} />
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Nothing reported right now
      </Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>
        {nationalOnly
          ? 'Turn on location to see incidents reported near you.'
          : 'We’ll show security updates for your area here as they come in.'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  title    : { fontSize: 15, fontWeight: '700' },
  body     : { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
```

- [ ] **Step 2: Rewrite `SafetyFeed.tsx`**

Replace the file's contents. `MOCK_FEED` is deleted outright — an empty feed must render the empty state, never fabricated incidents. Severity now drives the border colour and category drives the icon; the card's visual design is otherwise unchanged.

```tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';
import { useSafetyFeed } from '../hooks/useSafetyFeed';
import { FeedEmptyState } from './feed/FeedEmptyState';
import type { FeedRow, FeedSeverity } from '../lib/feed';
import { timeAgo } from '../utils/dateUtils';

const SEVERITY_COLOR: Record<FeedSeverity, string> = {
  critical: '#EF4444',
  warning : '#F97316',
  caution : '#F59E0B',
  info    : '#3B82F6',
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const CATEGORY_ICON: Record<string, IconName> = {
  armed_robbery  : 'pistol',
  kidnapping     : 'account-alert-outline',
  banditry       : 'shield-alert-outline',
  unrest_protest : 'bullhorn-outline',
  road_incident  : 'car-emergency',
  fire           : 'fire',
  flood          : 'waves',
  cult_clash     : 'account-group-outline',
  police_activity: 'police-badge-outline',
  fraud_scam     : 'credit-card-off-outline',
  terrorism      : 'alert-octagon-outline',
  herder_farmer  : 'cow',
  other          : 'information-outline',
};

interface SafetyFeedProps {
  limit?: number;
  onSeeAll?: () => void;
}

export const SafetyFeed = ({ limit = 4, onSeeAll }: SafetyFeedProps) => {
  const { colors } = useTheme();
  const { items, loading, isNationalOnly } = useSafetyFeed(limit);

  const open = (row: FeedRow) => {
    if (row.kind === 'news' && row.deep_link) void Linking.openURL(row.deep_link);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {isNationalOnly ? 'Security updates' : 'Recent in your area'}
        </Text>
        {onSeeAll && items.length > 0 && (
          <TouchableOpacity onPress={onSeeAll} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.status.safeText }]}>See all</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && items.length === 0 && (
        <ActivityIndicator style={styles.loader} color={colors.text.secondary} />
      )}

      {!loading && items.length === 0 && <FeedEmptyState nationalOnly={isNationalOnly} />}

      {items.map((item) => {
        const accent = SEVERITY_COLOR[item.severity] ?? SEVERITY_COLOR.info;
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.7}
            onPress={() => open(item)}
            style={[styles.card, {
              backgroundColor: colors.white,
              borderColor    : colors.border,
              borderLeftColor: accent,
            }]}
            accessibilityLabel={`${item.headline}: ${item.summary}`}
          >
            <MaterialCommunityIcons
              name={CATEGORY_ICON[item.category] ?? 'information-outline'}
              size={22}
              color={accent}
              style={styles.icon}
            />
            <View style={styles.content}>
              <Text style={[styles.alertTitle, { color: colors.text.primary }]}>
                {item.headline}
              </Text>
              <Text style={[styles.alertDesc, { color: colors.text.secondary }]}>
                {item.summary}
              </Text>
              <View style={styles.metaRow}>
                {/* News and community reports must never look alike. */}
                <Text style={[styles.badge, {
                  color          : colors.text.secondary,
                  borderColor    : colors.border,
                }]}>
                  {item.kind === 'news' ? item.source_label : 'Safen user report'}
                </Text>
                <Text style={[styles.alertTime, { color: colors.text.secondary }]}>
                  {timeAgo(item.occurred_at)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container    : { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8 },
  headerRow    : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title        : { fontSize: 16, fontWeight: '700' },
  seeAll       : { fontSize: 13, fontWeight: '600' },
  loader       : { marginVertical: 20 },
  card         : {
    flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12,
    borderWidth: 1, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 12,
    ...Shadows.sm,
  },
  icon         : { marginTop: 1 },
  content      : { flex: 1 },
  alertTitle   : { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  alertDesc    : { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  metaRow      : { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge        : {
    fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden',
  },
  alertTime    : { fontSize: 11 },
});
```

- [ ] **Step 3: Confirm the `timeAgo` helper exists**

```bash
grep -n "export function timeAgo\|export const timeAgo" src/utils/dateUtils.ts
```

If it is absent, add it to `src/utils/dateUtils.ts`:

```ts
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
```

- [ ] **Step 4: Mount on the Home screen**

In `app/(tabs)/index.tsx`, add the imports:

```tsx
import { useRouter } from 'expo-router';
import { SafetyFeed } from '../../src/components/SafetyFeed';
```

Add `const router = useRouter();` beside the existing hooks, and insert after `<QuickActions />` inside the `ScrollView` — below SOS, which stays above the fold:

```tsx
        {/* 6. Blended security feed — news + community, scoped to the user's area */}
        <SafetyFeed limit={4} onSeeAll={() => router.push('/feed')} />
```

- [ ] **Step 5: Verify no new type errors**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npx expo lint 2>&1 | tail -5
```

Expected: still `9` TypeScript errors. Lint introduces no new errors attributable to these files.

- [ ] **Step 6: Commit**

```bash
git add src/components/SafetyFeed.tsx src/components/feed/FeedEmptyState.tsx src/utils/dateUtils.ts "app/(tabs)/index.tsx"
git commit -m "feat(feed): wire SafetyFeed to live data, delete mock incidents, mount on home"
```

---

### Task 15: Full-feed route

**Files:**
- Create: `app/feed/_layout.tsx`
- Create: `app/feed/index.tsx`

**Interfaces:**
- Consumes: `useSafetyFeed` (Task 13), `SafetyFeed` styling conventions (Task 14).
- Produces: the `/feed` route — the "See all" target and the push deep-link target.

- [ ] **Step 1: Create the layout**

Mirror `app/history/_layout.tsx`. `app/feed/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function FeedLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create the screen**

`app/feed/index.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '../../src/context/ThemeContext';
import { useSafetyFeed } from '../../src/hooks/useSafetyFeed';
import { FeedEmptyState } from '../../src/components/feed/FeedEmptyState';
import { timeAgo } from '../../src/utils/dateUtils';
import type { FeedSeverity } from '../../src/lib/feed';

const SEVERITY_COLOR: Record<FeedSeverity, string> = {
  critical: '#EF4444', warning: '#F97316', caution: '#F59E0B', info: '#3B82F6',
};
const FILTERS: ('all' | FeedSeverity)[] = ['all', 'critical', 'warning', 'caution', 'info'];

export default function FeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, refreshing, isNationalOnly, refresh, loadMore } = useSafetyFeed(20);
  const [filter, setFilter] = useState<'all' | FeedSeverity>('all');

  const visible = useMemo(
    () => filter === 'all' ? items : items.filter((i) => i.severity === filter),
    [items, filter],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Security feed</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, {
              borderColor: filter === f ? colors.status.safeText : colors.border,
              backgroundColor: filter === f ? colors.status.safeBackground : 'transparent',
            }]}
          >
            <Text style={[styles.chipText, { color: colors.text.primary }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} />}
        ListEmptyComponent={<FeedEmptyState nationalOnly={isNationalOnly} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const accent = SEVERITY_COLOR[item.severity] ?? SEVERITY_COLOR.info;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { if (item.deep_link) void Linking.openURL(item.deep_link); }}
              style={[styles.card, {
                backgroundColor: colors.white,
                borderColor    : colors.border,
                borderLeftColor: accent,
              }]}
            >
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{item.headline}</Text>
              <Text style={[styles.cardBody, { color: colors.text.secondary }]}>{item.summary}</Text>
              {item.advice ? (
                <Text style={[styles.advice, { color: accent }]}>{item.advice}</Text>
              ) : null}
              <Text style={[styles.meta, { color: colors.text.secondary }]}>
                {item.kind === 'news' ? item.source_label : 'Safen user report'} · {timeAgo(item.occurred_at)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container  : { flex: 1 },
  header     : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  filters    : { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  chip       : { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipText   : { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  list       : { paddingHorizontal: 16, paddingBottom: 40 },
  card       : { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle  : { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardBody   : { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  advice     : { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  meta       : { fontSize: 11 },
});
```

- [ ] **Step 3: Verify no new type errors**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: still `9`.

- [ ] **Step 4: Commit**

```bash
git add app/feed
git commit -m "feat(feed): full security feed route with severity filters and pagination"
```

---

### Task 16: Severe-nearby push with a per-user daily cap

**Files:**
- Create: `supabase/migrations/20260827120800_news_push_log.sql`
- Create: `supabase/functions/notify-news/index.ts`
- Test: `supabase/tests/24_push_cap.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `news_items` (Task 7), the existing Expo push token storage used by `src/hooks/usePushNotifications.ts`.
- Produces: `public.news_push_log`, `public.claim_news_push(p_user_id uuid, p_news_id uuid) returns boolean`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260827120800_news_push_log.sql`:

```sql
create table if not exists public.news_push_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  news_id   uuid not null references public.news_items(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  unique (user_id, news_id)
);

create index if not exists news_push_log_user_day_idx
  on public.news_push_log (user_id, sent_at desc);

alter table public.news_push_log enable row level security;
revoke all on public.news_push_log from anon, authenticated;

-- Atomically reserves one of the user's 3 daily slots. Returns false when the
-- cap is reached or this item was already sent. These notifications share a
-- channel with SOS and Safe Check-In: a feed that trains users to mute Safen
-- has broken the app's core function.
create or replace function public.claim_news_push(p_user_id uuid, p_news_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sent_today integer;
begin
  select count(*) into sent_today
  from public.news_push_log
  where user_id = p_user_id and sent_at > now() - interval '24 hours';

  if sent_today >= 3 then
    return false;
  end if;

  begin
    insert into public.news_push_log (user_id, news_id) values (p_user_id, p_news_id);
  exception when unique_violation then
    return false;
  end;

  return true;
end $$;

revoke all on function public.claim_news_push(uuid, uuid) from public, anon, authenticated;
```

- [ ] **Step 2: Write the SQL assertions**

`supabase/tests/24_push_cap.sql`:

```sql
\set ON_ERROR_STOP on
begin;

do $$
declare
  u uuid;
  n1 uuid; n2 uuid; n3 uuid; n4 uuid;
  src uuid;
begin
  select id into u from auth.users limit 1;
  if u is null then
    raise notice 'no auth user available; skipping push cap assertions';
    return;
  end if;

  insert into public.news_sources (name, rss_url) values ('P','https://p.ng/feed')
    on conflict (rss_url) do nothing;
  select id into src from public.news_sources where rss_url = 'https://p.ng/feed';

  for i in 1..4 loop
    insert into public.news_items_raw (source_id, url, url_hash, title, status)
      values (src, 'https://p.ng/'||i, 'push-h'||i, 't', 'enriched');
  end loop;

  insert into public.news_items (raw_id, headline, summary, category, severity,
    confidence, state_code, published_at, source_name, source_url)
  select r.id, 'h', 's', 'other', 'critical', 0.9, 'LA', now(), 'P', 'https://p.ng/x'
  from public.news_items_raw r where r.url_hash like 'push-h%';

  select id into n1 from public.news_items order by created_at limit 1 offset 0;
  select id into n2 from public.news_items order by created_at limit 1 offset 1;
  select id into n3 from public.news_items order by created_at limit 1 offset 2;
  select id into n4 from public.news_items order by created_at limit 1 offset 3;

  if not public.claim_news_push(u, n1) then raise exception 'first claim must succeed'; end if;
  if not public.claim_news_push(u, n2) then raise exception 'second claim must succeed'; end if;
  if not public.claim_news_push(u, n3) then raise exception 'third claim must succeed'; end if;
  if public.claim_news_push(u, n4) then raise exception 'fourth claim must be capped'; end if;
  if public.claim_news_push(u, n1) then raise exception 'duplicate claim must be refused'; end if;
end $$;

rollback;
```

- [ ] **Step 3: Write the notifier**

`supabase/functions/notify-news/index.ts`. Triggered by a Database Webhook on INSERT into `public.news_items`, mirroring the existing `send-feedback` function's shape.

```ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PUSHWORTHY = new Set(["critical", "warning"]);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const item = payload.record;
    if (!item) return new Response("no record", { status: 400 });

    // Feed-only unless it is both severe AND locatable to an LGA.
    if (!PUSHWORTHY.has(item.severity) || !item.lga_code) {
      return new Response("not pushworthy", { status: 200 });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: recipients, error } = await db
      .from("profiles")
      .select("id, expo_push_token")
      .eq("last_lga_code", item.lga_code)
      .not("expo_push_token", "is", null);

    if (error) throw error;

    const messages: Record<string, unknown>[] = [];
    for (const r of recipients ?? []) {
      // Same token-shape guard the rest of src/lib/notifications.ts applies.
      if (!r.expo_push_token?.startsWith("ExponentPushToken")) continue;

      // Claim BEFORE queueing: the cap must be reserved atomically, or two
      // concurrent inserts both pass the count check and double-notify.
      const { data: claimed } = await db.rpc("claim_news_push", {
        p_user_id: r.id,
        p_news_id: item.id,
      });
      if (claimed !== true) continue;

      messages.push({
        to: r.expo_push_token,
        sound: "default",
        title: item.headline,
        body: item.summary,
        data: { type: "news_alert", route: "/feed", newsId: item.id },
      });
    }

    if (messages.length === 0) return new Response("no recipients", { status: 200 });

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) console.error("expo push failed:", await res.text());

    return Response.json({ sent: messages.length });
  } catch (err) {
    console.error("notify-news error:", err);
    return new Response("error", { status: 500 });
  }
});
```

> Column names verified against the codebase: `profiles.expo_push_token` is written by `src/hooks/usePushNotifications.ts:75` and read the same way throughout `src/lib/notifications.ts`. `profiles.last_lga_code` is added by Task 6's `20260827120450_profiles_area.sql` and populated by Task 13's `resolveArea`. A user whose area has never resolved has `last_lga_code = null` and is correctly excluded — never fall back to notifying everyone.

- [ ] **Step 4: Register the function**

Append to `supabase/config.toml`:

```toml
[functions.notify-news]
enabled = true
verify_jwt = false
import_map = "./functions/deno.json"
entrypoint = "./functions/notify-news/index.ts"
```

- [ ] **Step 5: Apply, test, type-check**

```bash
npx supabase db reset --local
bash supabase/tests/run.sh   # runs 24_push_cap.sql and every other assertion file
npx deno@2 check --config supabase/functions/deno.json supabase/functions/notify-news/index.ts
```

Expected: all three succeed.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827120800_news_push_log.sql supabase/functions/notify-news supabase/tests/24_push_cap.sql supabase/config.toml
git commit -m "feat(feed): severe-nearby push with atomic per-user daily cap"
```

---

### Task 17: Full-suite verification gate

No new behaviour. This task exists because the previous spec reached "complete" with every migration unexecuted.

**Files:** none.

- [ ] **Step 1: Run every Deno test**

```bash
npx deno@2 test -A --config supabase/functions/deno.json supabase/functions/
```

Expected: every test passes. Record the exact count.

- [ ] **Step 2: Replay all migrations from scratch**

```bash
npx supabase db reset --local
```

Expected: every migration applies in order onto an empty database. This proves replayability, which `db push` on an already-migrated database does not.

- [ ] **Step 3: Run every SQL assertion file**

```bash
for f in supabase/tests/2*.sql; do
  echo "--- $f"
  npx supabase db query --local -f "$f" || exit 1
done
```

Expected: each file completes with no exception.

- [ ] **Step 4: Confirm the client baseline is unchanged**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `9`.

- [ ] **Step 5: Record the results**

Write the actual counts into the execution ledger. Do not claim completion without the command output.

---

## Deployment (human-operated, outside this plan)

Deploying touches production and is deliberately not an agent task:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=<key>
npx supabase functions deploy ingest-news
npx supabase functions deploy enrich-news
npx supabase functions deploy notify-news --no-verify-jwt
npx supabase db push        # against the linked project
```

Then schedule `ingest-news` every 15 minutes and `enrich-news` at a 5-minute offset (`pg_cron` with `net.http_post`, or the dashboard's scheduler), and add a Database Webhook on INSERT into `public.news_items` targeting `notify-news`.

**Confirm the cron mechanism available on the current Supabase plan before writing the schedule** — this is an open item carried from the spec.
