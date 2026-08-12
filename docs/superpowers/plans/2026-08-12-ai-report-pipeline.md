# Safen AI Report Pipeline (Spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate incoming incident reports through an AI quality check that returns actionable feedback, assigns a priority, limits repeat failures, and groups duplicates — without ever blocking a genuine emergency report.

**Architecture:** A Deno Edge Function calls Claude Haiku 4.5 with a JSON-schema-constrained response, then mints a single-use token bound to a fingerprint of the approved text. The client uploads media and inserts the report carrying that token; a `BEFORE INSERT` trigger validates it. The trigger runs in advisory mode (logs, never rejects) until a single settings row flips it to enforcing. Every AI failure path fails open.

**Tech Stack:** Supabase (Postgres 17.6, Edge Functions/Deno 2.9), `npm:@anthropic-ai/sdk`, `claude-haiku-4-5`, React Native / Expo SDK 54, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-12-ai-report-pipeline-design.md`

---

## Global Constraints

- **Model is `claude-haiku-4-5`.** Never send `output_config.effort` — it errors on this model. Never add `cache_control` — Haiku 4.5's minimum cacheable prefix is 4096 tokens and ours is far shorter, so it would silently never engage. Omit `thinking` entirely (no thinking on this model when omitted, which is what we want).
- **`ANTHROPIC_API_KEY` lives only in Supabase secrets.** Never in `.env`, never referenced from `app/` or `src/`.
- **Every AI failure path fails open** — API error, timeout, refusal, unparseable response, missing key, over-quota. The report still submits, with a `quality_status` recording why.
- **Nothing in this plan touches `public.alerts`.** No gate, no strike, no trigger. SOS must work for a banned user.
- **All migrations are additive and idempotent** — `if not exists` / `create or replace` throughout. No `drop`, no column retype.
- **RLS is enabled on every new table in the same migration that creates it.** `report_quality_tokens` and `ai_usage_log` get no client-facing policy at all.
- **The gate trigger is `SECURITY DEFINER` with `set search_path = public, extensions`.** A definer function with a mutable search_path is a privilege-escalation vector.
- **Tunables live in `app_settings`, not env vars** — the trigger cannot read function secrets.
- Fingerprint normalisation is: collapse `[ \t\n\r\f\v]+` to a single space → strip one leading and one trailing ASCII space → lowercase. The TS and SQL implementations must agree byte for byte. **Never use JS `.trim()`** — it strips Unicode whitespace (U+00A0 and friends) that Postgres `btrim()` does not, which silently breaks the invariant on text pasted from Word or WhatsApp.

---

## Testing Strategy

This repo has **no test framework, no Docker, and no `psql`** — so before any task, understand the three loops that do exist. Do not add Jest, Vitest, or `jest-expo`; that is out of scope.

| Layer | Tool | Command |
|---|---|---|
| Edge Function pure logic | Deno's built-in runner (zero install) | `npx deno@2 test -A supabase/functions/` |
| Edge Function types | `deno check` | `npx deno@2 check supabase/functions/check-report-quality/index.ts` |
| SQL / migrations | Custom Deno harness using `npm:postgres` | `npx deno@2 run -A supabase/tests/run_sql_tests.ts` |
| Client TypeScript | tsc + eslint | `npx tsc --noEmit` && `npx expo lint` |
| End to end | Manual, against the deployed function | Task 12 |

**SQL tests never run against production.** They need `SUPABASE_DB_URL` pointing at a **throwaway free-tier Supabase project** created for rehearsal. Get its pooler connection string from Dashboard → Project Settings → Database → Connection string → URI.

```bash
# PowerShell
$env:SUPABASE_DB_URL="postgresql://postgres.xxx:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
# Git Bash
export SUPABASE_DB_URL="postgresql://postgres.xxx:pw@..."
```

Each SQL task follows a real red/green cycle: write the assertion file, run it against the rehearsal DB and watch it fail, apply the migration, run it again and watch it pass.

---

## Scope Note — read before starting

**The app has no `missing_person` category.** `app/(tabs)/report.tsx:16` defines `type IncidentType = 'medical' | 'fire' | 'security'`. The spec's missing-person rules (§4, decision 4) therefore have no trigger in the shipped app — the database clause would be dormant.

This plan **adds `missing_person` as a fourth category** (Task 15), because a rule that can never fire isn't an implementation of the brief. That is one extra category card plus two conditionally-rendered inputs — the "one place this spills past thin wiring" the spec already flagged. If you would rather ship the dormant clause and add the category later, cut Task 15's steps 4–7; Tasks 1–14 are unaffected.

---

## File Structure

**Created — migrations** (`supabase/migrations/`)

| File | Responsibility |
|---|---|
| `20260812120000_fingerprint.sql` | `sha256_hex`, `report_payload_fingerprint` |
| `20260812120100_app_settings.sql` | Single-row tunables table, seeded advisory |
| `20260812120200_quality_tokens.sql` | `report_quality_tokens` + RLS |
| `20260812120300_quality_gate.sql` | Gate columns on `reports` + trigger (token checks only) |
| `20260812120400_report_triage.sql` | Priority enum/columns; gate replaced to write them |
| `20260812120500_missing_person.sql` | `last_seen_at`, `police_reference`; gate replaced to enforce them |
| `20260812120600_spam_prevention.sql` | `report_strikes`, ban derivation |
| `20260812120700_incident_clusters.sql` | Haversine, clusters, clustering trigger |
| `20260812120800_trust_foundation.sql` | `profiles` counters, `report_flags`, `ai_usage_log` |

**Created — Edge Function** (`supabase/functions/`)

| File | Responsibility |
|---|---|
| `_shared/fingerprint.ts` | Normalisation + SHA-256. Pure. Mirrors the SQL exactly. |
| `_shared/emit_fingerprint.ts` | CLI emitter so the SQL test can assert against real TS output |
| `check-report-quality/prefilter.ts` | Deterministic pre-checks. Pure. No network. |
| `check-report-quality/claude.ts` | Anthropic client, JSON schema, response mapping, fail-open |
| `check-report-quality/db.ts` | All Supabase queries: settings, strikes, tokens, usage log |
| `check-report-quality/index.ts` | HTTP handler, CORS, orchestration |
| `deno.json` | Compiler options for `deno test` / `deno check` |

**Created — tests & docs:** `supabase/tests/run_sql_tests.ts`, `supabase/tests/*.sql`, `supabase/functions/**/*_test.ts`, `supabase/AI_PIPELINE.md`

**Created — client:** `src/lib/reportQuality.ts`

**Modified — client:** `src/hooks/useReport.ts` (whole file), `app/(tabs)/report.tsx:16` (type), `:18-43` (categories), `:49-63` (state), `:292-324` (submit handler)

---

### Task 1: Fingerprint — the TS/SQL invariant

The spec's top risk is these two implementations drifting. Build them together, prove they agree, and everything downstream rests on it.

**Files:**
- Create: `supabase/functions/deno.json`
- Create: `supabase/functions/_shared/fingerprint.ts`
- Create: `supabase/functions/_shared/fingerprint_test.ts`
- Create: `supabase/functions/_shared/emit_fingerprint.ts`
- Create: `supabase/migrations/20260812120000_fingerprint.sql`
- Create: `supabase/tests/run_sql_tests.ts`
- Create: `supabase/tests/01_fingerprint.sql`

**Interfaces:**
- Produces: `normalise(s: string): string`, `fingerprint(category: string, description: string): Promise<string>` (64-char lowercase hex), SQL `public.report_payload_fingerprint(text, text) returns text`, SQL `public.sha256_hex(text) returns text`

- [ ] **Step 1: Initialise the Supabase CLI config**

`supabase/config.toml` is absent even though `supabase/.temp/` shows the project linked. `db push` needs it.

```bash
npx supabase@2.114.0 init
npx supabase@2.114.0 link --project-ref ujbknxfvatvtwthxtytu
```

If `init` refuses because `supabase/` exists, pass `--force`; it does not delete `functions/`.

- [ ] **Step 2: Create the Deno config**

```json
{
  "compilerOptions": { "strict": true, "lib": ["deno.window", "esnext"] },
  "imports": { "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.68.0" }
}
```

- [ ] **Step 3: Write the failing test**

`supabase/functions/_shared/fingerprint_test.ts`:

```ts
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { fingerprint, normalise } from "./fingerprint.ts";

Deno.test("normalise collapses every whitespace char we support", () => {
  assertEquals(normalise("  a \t b \n c \r\n d  "), "a b c d");
});

Deno.test("normalise lowercases", () => {
  assertEquals(normalise("Allen AVENUE"), "allen avenue");
});

Deno.test("fingerprint is stable across whitespace and casing", async () => {
  const a = await fingerprint("security", "Man  took   my  BAG");
  const b = await fingerprint("  SECURITY ", "man took my bag");
  assertEquals(a, b);
});

Deno.test("fingerprint changes when meaning changes", async () => {
  const a = await fingerprint("security", "man took my bag");
  const b = await fingerprint("security", "man took my car");
  assertEquals(a === b, false);
});

Deno.test("fingerprint is 64 lowercase hex chars", async () => {
  assertMatch(await fingerprint("fire", "smoke on allen avenue"), /^[0-9a-f]{64}$/);
});

Deno.test("a non-breaking space is NOT treated as whitespace", () => {
  // Postgres btrim() does not strip U+00A0, so JS must not either, or the
  // TS and SQL fingerprints diverge on text pasted from Word or WhatsApp.
  assertEquals(normalise(" hello "), " hello ");
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx deno@2 test -A supabase/functions/_shared/fingerprint_test.ts
```

Expected: FAIL — `Module not found "./fingerprint.ts"`.

- [ ] **Step 5: Implement the module**

`supabase/functions/_shared/fingerprint.ts`:

```ts
/**
 * Normalisation MUST stay byte-identical to public.report_payload_fingerprint
 * in supabase/migrations/20260812120000_fingerprint.sql.
 * The character class is written out explicitly rather than using \s, because
 * JS \s matches Unicode spaces (e.g. U+00A0) that Postgres [[:space:]] does not.
 */
export function normalise(s: string): string {
  return s
    .replace(/[ \t\n\r\f\v]+/g, " ")
    // NOT .trim(): JS trim() strips the full Unicode whitespace set, including
    // U+00A0, which Postgres btrim() (ASCII space only) leaves in place. Using
    // it reintroduces TS/SQL drift on text pasted from Word or WhatsApp.
    // After the collapse above, at most one leading/trailing space remains.
    .replace(/^ /, "")
    .replace(/ $/, "")
    .toLowerCase();
}

export async function fingerprint(category: string, description: string): Promise<string> {
  const canonical = `${normalise(category ?? "")}\n${normalise(description ?? "")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx deno@2 test -A supabase/functions/_shared/fingerprint_test.ts
```

Expected: `ok | 6 passed | 0 failed`.

- [ ] **Step 7: Write the emitter**

`supabase/functions/_shared/emit_fingerprint.ts` — lets the SQL test assert against genuine TS output instead of a hand-copied constant.

```ts
import { fingerprint } from "./fingerprint.ts";
const [category, description] = Deno.args;
console.log(await fingerprint(category ?? "", description ?? ""));
```

- [ ] **Step 8: Write the SQL test harness**

`supabase/tests/run_sql_tests.ts`:

```ts
import postgres from "npm:postgres@3.4.4";

const url = Deno.env.get("SUPABASE_DB_URL");
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Point it at the REHEARSAL project, never production.");
  Deno.exit(2);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });
const dir = new URL("./", import.meta.url);
const files = [...Deno.readDirSync(dir)]
  .filter((f) => f.name.endsWith(".sql"))
  .map((f) => f.name)
  .sort();

let failed = 0;
for (const name of files) {
  const body = await Deno.readTextFile(new URL(name, dir));
  try {
    await sql.unsafe(body);
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}
await sql.end();
console.log(failed === 0 ? "\nAll SQL tests passed." : `\n${failed} SQL test file(s) failed.`);
Deno.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 9: Write the failing SQL test**

`supabase/tests/01_fingerprint.sql`:

```sql
do $$
begin
  -- Whitespace and casing must not change the fingerprint.
  assert public.report_payload_fingerprint('security', 'Man  took   my  BAG')
       = public.report_payload_fingerprint('  SECURITY ', 'man took my bag'),
    'fingerprint is not normalisation-stable';

  -- Different meaning must change it.
  assert public.report_payload_fingerprint('security', 'man took my bag')
      <> public.report_payload_fingerprint('security', 'man took my car'),
    'fingerprint collides on different descriptions';

  -- Shape.
  assert public.report_payload_fingerprint('fire', 'smoke') ~ '^[0-9a-f]{64}$',
    'fingerprint is not 64 lowercase hex chars';

  -- Vertical tab must collapse, which proves the E'[ \\t\\n\\r\\f\\v]+'
  -- double-backslash escaping survived the E-string decoder. Postgres does not
  -- recognise \v as a string escape, so a single backslash would silently
  -- decode to the letter "v" and break the class without any error.
  assert public.report_payload_fingerprint('security', E'a\vb')
       = public.report_payload_fingerprint('security', 'a b'),
    'vertical tab is not being collapsed — check the E-string escaping';

  -- Agreement with the TypeScript implementation. The input carries a tab AND
  -- a newline deliberately: an all-spaces input would pass even with naive
  -- whitespace handling, proving nothing about the two engines agreeing.
  -- Regenerate with:
  --   npx deno@2 run supabase/functions/_shared/emit_fingerprint.ts "security" $'Man\ttook\nmy   BAG'
  assert public.report_payload_fingerprint('security', E'Man\ttook\nmy   BAG')
       = current_setting('safen.expected_fp', true),
    format('SQL/TS fingerprint drift: sql=%s ts=%s',
           public.report_payload_fingerprint('security', E'Man\ttook\nmy   BAG'),
           current_setting('safen.expected_fp', true));
end $$;
```

- [ ] **Step 10: Teach the harness to inject the TS-derived value**

Add to `run_sql_tests.ts`, immediately after the `sql` client is constructed:

```ts
const proc = new Deno.Command("npx", {
  args: ["deno@2", "run", "supabase/functions/_shared/emit_fingerprint.ts",
         "security", "Man\ttook\nmy   BAG"],
  stdout: "piped",
});
const expectedFp = new TextDecoder().decode((await proc.output()).stdout).trim();
await sql.unsafe(`set safen.expected_fp = '${expectedFp}'`);
```

- [ ] **Step 11: Run it and watch it fail**

```bash
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: `FAIL 01_fingerprint.sql — function public.report_payload_fingerprint(...) does not exist`.

- [ ] **Step 12: Write the migration**

`supabase/migrations/20260812120000_fingerprint.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

create or replace function public.sha256_hex(p_text text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_text, ''), 'sha256'), 'hex');
$$;

-- Normalisation MUST stay byte-identical to normalise() in
-- supabase/functions/_shared/fingerprint.ts. The character class is explicit
-- rather than [[:space:]] so the two engines cannot disagree on Unicode spaces.
create or replace function public.report_payload_fingerprint(p_category text, p_description text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select public.sha256_hex(
    lower(btrim(regexp_replace(coalesce(p_category, ''),    E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
    || E'\n' ||
    lower(btrim(regexp_replace(coalesce(p_description, ''), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
  );
$$;
```

- [ ] **Step 13: Apply to the rehearsal project and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: `ok   01_fingerprint.sql` and `All SQL tests passed.` If the last assertion fails, the two normalisations have drifted — fix before going further; everything downstream depends on this.

- [ ] **Step 14: Commit**

```bash
git add supabase/ docs/superpowers/plans/
git commit -m "feat(ai): fingerprint helpers with TS/SQL agreement test"
```

---

### Task 2: Settings and token store

**Files:**
- Create: `supabase/migrations/20260812120100_app_settings.sql`
- Create: `supabase/migrations/20260812120200_quality_tokens.sql`
- Create: `supabase/tests/02_settings_and_tokens.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `public.app_settings` (single row, id fixed `true`), `public.report_quality_tokens`, `public.current_settings()` returning the settings row

- [ ] **Step 1: Write the failing test**

`supabase/tests/02_settings_and_tokens.sql`:

```sql
do $$
declare
  v_mode text;
  v_count int;
begin
  select quality_gate_mode into v_mode from public.app_settings;
  assert v_mode = 'advisory', 'app_settings must seed as advisory';

  select count(*) into v_count from public.app_settings;
  assert v_count = 1, 'app_settings must hold exactly one row';

  -- The single-row guard must reject a second row.
  begin
    insert into public.app_settings (id) values (false);
    assert false, 'app_settings accepted a second row';
  exception when others then null;
  end;

  assert (select relrowsecurity from pg_class where oid = 'public.report_quality_tokens'::regclass),
    'RLS is not enabled on report_quality_tokens';

  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'report_quality_tokens';
  assert v_count = 0, 'report_quality_tokens must have no client-facing policy';
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: `FAIL 02_settings_and_tokens.sql — relation "public.app_settings" does not exist`.

- [ ] **Step 3: Write the settings migration**

`supabase/migrations/20260812120100_app_settings.sql`:

```sql
create table if not exists public.app_settings (
  id                      boolean primary key default true,
  quality_gate_mode       text        not null default 'advisory'
                            check (quality_gate_mode in ('advisory', 'enforcing')),
  strike_threshold        integer     not null default 3,
  strike_window_minutes   integer     not null default 15,
  ban_minutes             integer     not null default 30,
  daily_call_ceiling      integer     not null default 40,
  min_description_words   integer     not null default 15,
  dupe_radius_meters      integer     not null default 500,
  dupe_window_minutes     integer     not null default 60,
  cluster_confirm_count   integer     not null default 5,
  updated_at              timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

create or replace function public.current_settings()
returns public.app_settings
language sql
stable
set search_path = public
as $$
  select * from public.app_settings limit 1;
$$;
```

- [ ] **Step 4: Write the tokens migration**

`supabase/migrations/20260812120200_quality_tokens.sql`:

```sql
create table if not exists public.report_quality_tokens (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  token_sha256        text        not null unique,
  payload_fingerprint text        not null,
  verdict             text        not null default 'passed'
                        check (verdict in ('passed', 'skipped_ai_unavailable', 'skipped_quota')),
  priority            text        check (priority in ('critical', 'high', 'medium', 'low')),
  expires_at          timestamptz not null,
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists report_quality_tokens_user_idx
  on public.report_quality_tokens (user_id, created_at desc);

-- RLS on, and deliberately NO policy: the service role bypasses RLS, every
-- other role is denied. This table is what stands between a client and a
-- forged pass.
alter table public.report_quality_tokens enable row level security;
```

- [ ] **Step 5: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: both files `ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat(ai): app_settings singleton and quality token store"
```

---

### Task 3: Gate columns and the advisory trigger

**Files:**
- Create: `supabase/migrations/20260812120300_quality_gate.sql`
- Create: `supabase/tests/03_quality_gate.sql`

**Interfaces:**
- Consumes: `report_payload_fingerprint`, `sha256_hex`, `app_settings`, `report_quality_tokens`
- Produces: `reports.quality_token`, `reports.quality_checked_at`, `reports.quality_status`, `reports.gate_reason`; trigger `trg_report_quality_gate`; gate reason codes `QUALITY_GATE_TOKEN_MISSING|UNKNOWN|USED|EXPIRED|WRONG_USER`, `QUALITY_GATE_PAYLOAD_MISMATCH`

> **Addition to the spec:** `reports.gate_reason` is not in spec §4. It records *why* a row would have been rejected while in advisory mode. Without it, advisory mode tells you a report would have failed but not what to fix.

- [ ] **Step 1: Write the failing test**

`supabase/tests/03_quality_gate.sql`:

```sql
do $$
declare
  v_user uuid;
  v_token text := 'tok_test_' || gen_random_uuid()::text;
  v_id uuid;
  v_status text;
  v_reason text;
begin
  select id into v_user from public.profiles limit 1;
  assert v_user is not null, 'seed at least one profile in the rehearsal project';

  update public.app_settings set quality_gate_mode = 'advisory';

  -- Advisory: a report with no token is admitted, and the reason is recorded.
  insert into public.reports (user_id, category, description, status)
  values (v_user, 'security', 'no token at all', 'open')
  returning id, quality_status, gate_reason into v_id, v_status, v_reason;
  assert v_reason = 'QUALITY_GATE_TOKEN_MISSING', 'advisory did not record the missing token';
  delete from public.reports where id = v_id;

  -- A valid token passes, is consumed, and the column is blanked.
  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('security', 'a real description here'),
          'passed', now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'security', 'a real description here', 'open', v_token)
  returning id, quality_status, gate_reason into v_id, v_status, v_reason;

  assert v_status = 'passed',        format('expected passed, got %s', v_status);
  assert v_reason is null,           'gate_reason should be null on a pass';
  assert (select quality_token from public.reports where id = v_id) is null,
    'quality_token was not blanked';
  assert (select used_at from public.report_quality_tokens
           where token_sha256 = public.sha256_hex(v_token)) is not null,
    'token was not marked used';
  delete from public.reports where id = v_id;

  -- Enforcing: altered text after approval must be rejected.
  update public.app_settings set quality_gate_mode = 'enforcing';
  begin
    insert into public.reports (user_id, category, description, status, quality_token)
    values (v_user, 'security', 'COMPLETELY different text', 'open', v_token);
    assert false, 'enforcing mode admitted a payload mismatch';
  exception when others then
    assert sqlerrm like '%QUALITY_GATE%', format('unexpected error: %s', sqlerrm);
  end;

  update public.app_settings set quality_gate_mode = 'advisory';
  delete from public.report_quality_tokens where token_sha256 = public.sha256_hex(v_token);
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: `FAIL 03_quality_gate.sql — column "quality_token" of relation "reports" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120300_quality_gate.sql`:

```sql
alter table public.reports add column if not exists quality_token      text;
alter table public.reports add column if not exists quality_checked_at timestamptz;
alter table public.reports add column if not exists quality_status     text;
alter table public.reports add column if not exists gate_reason        text;

create or replace function public.enforce_report_quality_gate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.app_settings;
  tok    public.report_quality_tokens;
  reason text := null;
begin
  s := public.current_settings();

  if new.quality_token is null then
    reason := 'QUALITY_GATE_TOKEN_MISSING';
  else
    select * into tok from public.report_quality_tokens
     where token_sha256 = public.sha256_hex(new.quality_token);

    if not found then                                   reason := 'QUALITY_GATE_TOKEN_UNKNOWN';
    elsif tok.used_at is not null then                  reason := 'QUALITY_GATE_TOKEN_USED';
    elsif tok.expires_at < now() then                   reason := 'QUALITY_GATE_TOKEN_EXPIRED';
    elsif tok.user_id is distinct from new.user_id then reason := 'QUALITY_GATE_TOKEN_WRONG_USER';
    elsif tok.payload_fingerprint is distinct from
          public.report_payload_fingerprint(new.category, new.description) then
      reason := 'QUALITY_GATE_PAYLOAD_MISMATCH';
    end if;
  end if;

  if reason is null then
    update public.report_quality_tokens set used_at = now() where id = tok.id;
    new.quality_status     := tok.verdict;
    new.quality_checked_at := now();
    new.gate_reason        := null;
  else
    if s.quality_gate_mode = 'enforcing' then
      raise exception '%', reason using errcode = 'P0001';
    end if;
    new.quality_status := coalesce(new.quality_status, 'advisory_failed');
    new.gate_reason    := reason;
  end if;

  new.quality_token := null;   -- never persist the plaintext token
  return new;
end $$;

drop trigger if exists trg_report_quality_gate on public.reports;
create trigger trg_report_quality_gate
  before insert on public.reports
  for each row execute function public.enforce_report_quality_gate();
```

- [ ] **Step 4: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: all three files `ok`.

- [ ] **Step 5: Verify SOS is untouched**

```bash
# In the rehearsal SQL editor, or append to a scratch .sql file:
#   insert into public.alerts (user_id, type, status)
#   values ((select id from public.profiles limit 1), 'sos', 'active');
# Expected: succeeds. No trigger on alerts, no token required.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat(ai): report quality gate trigger in advisory mode"
```

---

### Task 4: Priority triage columns

**Files:**
- Create: `supabase/migrations/20260812120400_report_triage.sql`
- Create: `supabase/tests/04_triage.sql`

**Interfaces:**
- Consumes: the gate function from Task 3 (replaced here via `create or replace`)
- Produces: `report_priority` enum, `reports.priority`, `reports.priority_rank`, `reports.triage_reason`

- [ ] **Step 1: Write the failing test**

`supabase/tests/04_triage.sql`:

```sql
do $$
declare
  v_user uuid; v_token text := 'tok_tri_' || gen_random_uuid()::text;
  v_id uuid; v_pri public.report_priority; v_rank smallint;
begin
  select id into v_user from public.profiles limit 1;
  update public.app_settings set quality_gate_mode = 'advisory';

  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, priority, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('security', 'armed men on allen avenue now'),
          'passed', 'critical', now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'security', 'armed men on allen avenue now', 'open', v_token)
  returning id, priority, priority_rank into v_id, v_pri, v_rank;

  assert v_pri  = 'critical', format('expected critical, got %s', v_pri);
  assert v_rank = 4,          format('expected rank 4, got %s', v_rank);

  delete from public.reports where id = v_id;

  -- A token minted by a fail-open path carries no priority: default to medium.
  v_token := 'tok_tri2_' || gen_random_uuid()::text;
  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, priority, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('fire', 'smoke somewhere'),
          'skipped_ai_unavailable', null, now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'fire', 'smoke somewhere', 'open', v_token)
  returning id, priority into v_id, v_pri;
  assert v_pri = 'medium', 'fail-open token should default priority to medium';
  assert (select triage_reason from public.reports where id = v_id) = 'ai_unavailable',
    'triage_reason not recorded for fail-open';
  delete from public.reports where id = v_id;
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: `FAIL 04_triage.sql — type "public.report_priority" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120400_report_triage.sql`:

```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_priority') then
    create type public.report_priority as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

alter table public.reports add column if not exists priority      public.report_priority;
alter table public.reports add column if not exists priority_rank smallint;
alter table public.reports add column if not exists triage_reason text;

create index if not exists reports_priority_rank_idx
  on public.reports (priority_rank desc, created_at desc);

create or replace function public.enforce_report_quality_gate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.app_settings;
  tok    public.report_quality_tokens;
  reason text := null;
  pri    public.report_priority;
begin
  s := public.current_settings();

  if new.quality_token is null then
    reason := 'QUALITY_GATE_TOKEN_MISSING';
  else
    select * into tok from public.report_quality_tokens
     where token_sha256 = public.sha256_hex(new.quality_token);

    if not found then                                   reason := 'QUALITY_GATE_TOKEN_UNKNOWN';
    elsif tok.used_at is not null then                  reason := 'QUALITY_GATE_TOKEN_USED';
    elsif tok.expires_at < now() then                   reason := 'QUALITY_GATE_TOKEN_EXPIRED';
    elsif tok.user_id is distinct from new.user_id then reason := 'QUALITY_GATE_TOKEN_WRONG_USER';
    elsif tok.payload_fingerprint is distinct from
          public.report_payload_fingerprint(new.category, new.description) then
      reason := 'QUALITY_GATE_PAYLOAD_MISMATCH';
    end if;
  end if;

  if reason is null then
    update public.report_quality_tokens set used_at = now() where id = tok.id;
    new.quality_status     := tok.verdict;
    new.quality_checked_at := now();
    new.gate_reason        := null;

    pri := coalesce(tok.priority::public.report_priority, 'medium');
    new.priority      := pri;
    new.priority_rank := case pri when 'critical' then 4 when 'high' then 3
                                  when 'medium'   then 2 else 1 end;
    if tok.priority is null then
      new.triage_reason := case tok.verdict
        when 'skipped_ai_unavailable' then 'ai_unavailable'
        when 'skipped_quota'          then 'quota_exceeded'
        else 'unscored' end;
    end if;
  else
    if s.quality_gate_mode = 'enforcing' then
      raise exception '%', reason using errcode = 'P0001';
    end if;
    new.quality_status := coalesce(new.quality_status, 'advisory_failed');
    new.gate_reason    := reason;
    new.priority       := coalesce(new.priority, 'medium');
    new.priority_rank  := coalesce(new.priority_rank, 2);
  end if;

  new.quality_token := null;
  return new;
end $$;
```

- [ ] **Step 4: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: four files `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(ai): priority triage columns written by the gate"
```

---

### Task 5: Missing-person fields and enforcement

**Files:**
- Create: `supabase/migrations/20260812120500_missing_person.sql`
- Create: `supabase/tests/05_missing_person.sql`

**Interfaces:**
- Consumes: gate function from Task 4 (replaced again)
- Produces: `reports.last_seen_at`, `reports.police_reference`; reason codes `QUALITY_GATE_MISSING_PERSON_PHOTO|LAST_SEEN|POLICE_REF|LOCATION`

- [ ] **Step 1: Write the failing test**

`supabase/tests/05_missing_person.sql`:

```sql
do $$
declare
  v_user uuid; v_reason text;
begin
  select id into v_user from public.profiles limit 1;
  update public.app_settings set quality_gate_mode = 'enforcing';

  -- Each of the four omissions must be rejected, WITHOUT any AI involvement.
  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', null,
            now(), 'Ikeja/CR/1123', 6.6, 3.35);
    assert false, 'accepted a missing-person report with no photo';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_PHOTO%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            null, 'Ikeja/CR/1123', 6.6, 3.35);
    assert false, 'accepted a missing-person report with no last_seen_at';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_LAST_SEEN%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            now(), '   ', 6.6, 3.35);
    assert false, 'accepted a missing-person report with a blank police reference';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_POLICE_REF%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            now(), 'Ikeja/CR/1123', null, null);
    assert false, 'accepted a missing-person report with no coordinates';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_LOCATION%', format('wrong error: %s', sqlerrm);
  end;

  -- Other categories are unaffected by these rules.
  update public.app_settings set quality_gate_mode = 'advisory';
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

Expected: `FAIL 05_missing_person.sql — column "last_seen_at" of relation "reports" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120500_missing_person.sql`:

```sql
alter table public.reports add column if not exists last_seen_at     timestamptz;
alter table public.reports add column if not exists police_reference text;

create or replace function public.missing_person_gap(r public.reports)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when r.category <> 'missing_person'                       then null
    when coalesce(array_length(r.media_paths, 1), 0) = 0      then 'QUALITY_GATE_MISSING_PERSON_PHOTO'
    when r.last_seen_at is null                               then 'QUALITY_GATE_MISSING_PERSON_LAST_SEEN'
    when coalesce(btrim(r.police_reference), '') = ''         then 'QUALITY_GATE_MISSING_PERSON_POLICE_REF'
    when r.latitude is null or r.longitude is null            then 'QUALITY_GATE_MISSING_PERSON_LOCATION'
    else null
  end;
$$;
```

Then append to the same migration file the complete replacement gate, which
checks the missing-person gap **before** the token and — unlike token problems —
enforces it in advisory mode too:

```sql
create or replace function public.enforce_report_quality_gate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.app_settings;
  tok    public.report_quality_tokens;
  reason text := null;
  pri    public.report_priority;
begin
  s := public.current_settings();

  -- Deterministic, AI-independent, and enforced even in advisory mode: these
  -- four fields are the brief's hard requirement for missing-person reports,
  -- and they never depended on the model.
  reason := public.missing_person_gap(new);
  if reason is not null then
    raise exception '%', reason using errcode = 'P0001';
  end if;

  if new.quality_token is null then
    reason := 'QUALITY_GATE_TOKEN_MISSING';
  else
    select * into tok from public.report_quality_tokens
     where token_sha256 = public.sha256_hex(new.quality_token);

    if not found then                                   reason := 'QUALITY_GATE_TOKEN_UNKNOWN';
    elsif tok.used_at is not null then                  reason := 'QUALITY_GATE_TOKEN_USED';
    elsif tok.expires_at < now() then                   reason := 'QUALITY_GATE_TOKEN_EXPIRED';
    elsif tok.user_id is distinct from new.user_id then reason := 'QUALITY_GATE_TOKEN_WRONG_USER';
    elsif tok.payload_fingerprint is distinct from
          public.report_payload_fingerprint(new.category, new.description) then
      reason := 'QUALITY_GATE_PAYLOAD_MISMATCH';
    end if;
  end if;

  if reason is null then
    update public.report_quality_tokens set used_at = now() where id = tok.id;
    new.quality_status     := tok.verdict;
    new.quality_checked_at := now();
    new.gate_reason        := null;

    pri := coalesce(tok.priority::public.report_priority, 'medium');
    new.priority      := pri;
    new.priority_rank := case pri when 'critical' then 4 when 'high' then 3
                                  when 'medium'   then 2 else 1 end;
    if tok.priority is null then
      new.triage_reason := case tok.verdict
        when 'skipped_ai_unavailable' then 'ai_unavailable'
        when 'skipped_quota'          then 'quota_exceeded'
        else 'unscored' end;
    end if;
  else
    if s.quality_gate_mode = 'enforcing' then
      raise exception '%', reason using errcode = 'P0001';
    end if;
    new.quality_status := coalesce(new.quality_status, 'advisory_failed');
    new.gate_reason    := reason;
    new.priority       := coalesce(new.priority, 'medium');
    new.priority_rank  := coalesce(new.priority_rank, 2);
  end if;

  new.quality_token := null;
  return new;
end $$;
```

> Advisory mode governs the *AI* gate. The missing-person rules are structural
> data requirements that never depended on the model, so they apply immediately.
> Task 15 adds the form fields that let the app satisfy them.

- [ ] **Step 4: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: five files `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(ai): missing-person fields enforced independently of the AI"
```

---

### Task 6: Strikes and ban derivation

**Files:**
- Create: `supabase/migrations/20260812120600_spam_prevention.sql`
- Create: `supabase/tests/06_strikes.sql`

**Interfaces:**
- Produces: `public.report_strikes`, `public.record_strike(uuid, text)`, `public.strike_state(uuid)` returning `(strike_count int, banned_until timestamptz)`

- [ ] **Step 1: Write the failing test**

`supabase/tests/06_strikes.sql`:

```sql
do $$
declare
  v_user uuid; v_count int; v_until timestamptz;
begin
  select id into v_user from public.profiles limit 1;
  delete from public.report_strikes where user_id = v_user;

  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 0,        'fresh user should have no strikes';
  assert v_until is null,    'fresh user should not be banned';

  perform public.record_strike(v_user, 'needs_detail');
  perform public.record_strike(v_user, 'needs_detail');
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 2,     format('expected 2 strikes, got %s', v_count);
  assert v_until is null, 'two strikes must not trigger a ban';

  perform public.record_strike(v_user, 'failed_prefilter');
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 3,         format('expected 3 strikes, got %s', v_count);
  assert v_until > now(),     'three strikes inside the window must ban';

  -- Strikes older than the window do not count.
  update public.report_strikes set created_at = now() - interval '48 hours'
   where user_id = v_user;
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 0,     'expired strikes must not count';
  assert v_until is null, 'ban must lapse once strikes age out';

  delete from public.report_strikes where user_id = v_user;
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

Expected: `FAIL 06_strikes.sql — relation "public.report_strikes" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120600_spam_prevention.sql`:

```sql
create table if not exists public.report_strikes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  reason     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists report_strikes_user_time_idx
  on public.report_strikes (user_id, created_at desc);

alter table public.report_strikes enable row level security;

drop policy if exists report_strikes_read_own on public.report_strikes;
create policy report_strikes_read_own on public.report_strikes
  for select to authenticated using (user_id = auth.uid());

create or replace function public.record_strike(p_user uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.report_strikes (user_id, reason) values (p_user, p_reason);
$$;

-- Ban state is DERIVED, never stored: no expiry job, no stuck ban to clean up.
create or replace function public.strike_state(p_user uuid)
returns table (strike_count integer, banned_until timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.app_settings;
begin
  s := public.current_settings();

  select count(*)::int, max(created_at)
    into strike_count, banned_until
    from public.report_strikes
   where user_id = p_user
     and created_at > now() - make_interval(mins => s.strike_window_minutes);

  if strike_count >= s.strike_threshold then
    banned_until := banned_until + make_interval(mins => s.ban_minutes);
    if banned_until <= now() then banned_until := null; end if;
  else
    banned_until := null;
  end if;

  return next;
end $$;
```

- [ ] **Step 4: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: six files `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(ai): strike recording with derived ban state"
```

---

### Task 7: Duplicate clustering

**Files:**
- Create: `supabase/migrations/20260812120700_incident_clusters.sql`
- Create: `supabase/tests/07_clusters.sql`

**Interfaces:**
- Produces: `public.haversine_meters(double precision, double precision, double precision, double precision)`, `public.incident_clusters`, `reports.cluster_id`, trigger `trg_cluster_report`

- [ ] **Step 1: Write the failing test**

`supabase/tests/07_clusters.sql`:

```sql
do $$
declare
  v_a uuid; v_b uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_distinct int;
begin
  select id into v_a from public.profiles limit 1;
  select id into v_b from public.profiles where id <> v_a limit 1;
  assert v_b is not null, 'seed at least two profiles in the rehearsal project';

  update public.app_settings set quality_gate_mode = 'advisory';

  -- ~110m apart: same incident.
  assert public.haversine_meters(6.6000, 3.3500, 6.6010, 3.3500) between 100 and 120,
    'haversine is miscalibrated';

  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_a, 'security', 'robbery at the junction', 'open', 6.6000, 3.3500)
  returning id, cluster_id into v_r1, v_c1;

  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_b, 'security', 'men robbing people near junction', 'open', 6.6010, 3.3500)
  returning id, cluster_id into v_r2, v_c2;

  assert v_c1 is not null and v_c1 = v_c2, 'nearby same-category reports did not cluster';

  select distinct_reporter_count into v_distinct
    from public.incident_clusters where id = v_c1;
  assert v_distinct = 2, format('expected 2 distinct reporters, got %s', v_distinct);

  -- ~11km away: different incident.
  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_a, 'security', 'unrelated robbery far away', 'open', 6.7000, 3.3500)
  returning id, cluster_id into v_r3, v_c3;
  assert v_c3 is distinct from v_c1, 'a distant report was wrongly clustered';

  delete from public.reports where id in (v_r1, v_r2, v_r3);
  delete from public.incident_clusters where id in (v_c1, v_c3);
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

Expected: `FAIL 07_clusters.sql — function public.haversine_meters(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120700_incident_clusters.sql`:

```sql
create or replace function public.haversine_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

create table if not exists public.incident_clusters (
  id                      uuid primary key default gen_random_uuid(),
  category                text        not null,
  centroid_lat            double precision not null,
  centroid_lng            double precision not null,
  report_count            integer     not null default 0,
  distinct_reporter_count integer     not null default 0,
  first_reported_at       timestamptz not null default now(),
  last_reported_at        timestamptz not null default now(),
  confirmed_at            timestamptz
);

alter table public.reports add column if not exists cluster_id uuid
  references public.incident_clusters(id) on delete set null;

create index if not exists reports_geo_time_idx
  on public.reports (category, created_at desc)
  where latitude is not null;

alter table public.incident_clusters enable row level security;

drop policy if exists incident_clusters_read on public.incident_clusters;
create policy incident_clusters_read on public.incident_clusters
  for select to authenticated using (true);

create or replace function public.cluster_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings;
  c uuid;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  s := public.current_settings();

  -- Bounding-box prefilter on the btree index, then exact haversine.
  -- 1 degree of latitude is ~111,320m; longitude is scaled by cos(lat).
  select ic.id into c
    from public.incident_clusters ic
   where ic.category = new.category
     and ic.last_reported_at > now() - make_interval(mins => s.dupe_window_minutes)
     and ic.centroid_lat between new.latitude  - (s.dupe_radius_meters / 111320.0)
                             and new.latitude  + (s.dupe_radius_meters / 111320.0)
     and ic.centroid_lng between new.longitude - (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
                             and new.longitude + (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
     and public.haversine_meters(ic.centroid_lat, ic.centroid_lng, new.latitude, new.longitude)
         <= s.dupe_radius_meters
   order by ic.last_reported_at desc
   limit 1;

  if c is null then
    insert into public.incident_clusters (category, centroid_lat, centroid_lng,
                                          report_count, distinct_reporter_count)
    values (new.category, new.latitude, new.longitude, 1, 1)
    returning id into c;
  else
    update public.incident_clusters ic
       set report_count     = ic.report_count + 1,
           last_reported_at = now(),
           centroid_lat     = (ic.centroid_lat * ic.report_count + new.latitude)  / (ic.report_count + 1),
           centroid_lng     = (ic.centroid_lng * ic.report_count + new.longitude) / (ic.report_count + 1),
           distinct_reporter_count = (
             select count(distinct r.user_id) + 1
               from public.reports r
              where r.cluster_id = ic.id and r.user_id is distinct from new.user_id
           )
     where ic.id = c;

    update public.incident_clusters ic
       set confirmed_at = now()
     where ic.id = c
       and ic.confirmed_at is null
       and ic.distinct_reporter_count >= s.cluster_confirm_count;
  end if;

  update public.reports set cluster_id = c where id = new.id;
  return new;
end $$;

drop trigger if exists trg_cluster_report on public.reports;
create trigger trg_cluster_report
  after insert on public.reports
  for each row execute function public.cluster_report();
```

> The clustering trigger is `AFTER INSERT` and updates the row's `cluster_id`
> separately, because `NEW` is not writable after the row is committed. The test
> reads `cluster_id` via `returning`, which sees the `BEFORE` value — so it
> re-reads. If `returning` yields null, select the row again.

- [ ] **Step 4: Adjust the test to re-read after the AFTER trigger**

Replace the two `returning id, cluster_id into ...` lines for `v_r1`/`v_r2` with
`returning id into v_r1;` (respectively `v_r2`), then read the cluster:

```sql
  select cluster_id into v_c1 from public.reports where id = v_r1;
  select cluster_id into v_c2 from public.reports where id = v_r2;
```

Do the same for `v_r3`/`v_c3`.

- [ ] **Step 5: Apply and run the tests**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: seven files `ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat(ai): haversine duplicate clustering"
```

---

### Task 8: Trust foundation and usage log

**Files:**
- Create: `supabase/migrations/20260812120800_trust_foundation.sql`
- Create: `supabase/tests/08_trust_and_usage.sql`

**Interfaces:**
- Produces: `profiles.trust_score`, `profiles.reports_submitted`, `profiles.reports_confirmed`, `profiles.reports_flagged_fake`, `reports.verification_status`, `public.report_flags`, `public.ai_usage_log`, `public.ai_calls_today(uuid) returns integer`

- [ ] **Step 1: Write the failing test**

`supabase/tests/08_trust_and_usage.sql`:

```sql
do $$
declare
  v_user uuid; v_before int; v_after int; v_calls int;
begin
  select id into v_user from public.profiles limit 1;
  update public.app_settings set quality_gate_mode = 'advisory';

  select reports_submitted into v_before from public.profiles where id = v_user;

  insert into public.reports (user_id, category, description, status)
  values (v_user, 'security', 'counter increment check', 'open');

  select reports_submitted into v_after from public.profiles where id = v_user;
  assert v_after = v_before + 1, 'reports_submitted did not increment';

  assert (select trust_score from public.profiles where id = v_user) = 50,
    'trust_score should sit at its default of 50 (no scoring in Spec 1)';

  -- Confirming a cluster must mark its reports and bump the reporter counter.
  declare
    v_cluster uuid; v_confirmed_before int; v_confirmed_after int; v_report uuid;
  begin
    select reports_confirmed into v_confirmed_before from public.profiles where id = v_user;

    insert into public.incident_clusters (category, centroid_lat, centroid_lng,
                                          report_count, distinct_reporter_count)
    values ('security', 6.61, 3.36, 1, 1) returning id into v_cluster;

    insert into public.reports (user_id, category, description, status)
    values (v_user, 'security', 'cluster confirmation check', 'open')
    returning id into v_report;
    update public.reports set cluster_id = v_cluster where id = v_report;

    update public.incident_clusters set confirmed_at = now() where id = v_cluster;

    assert (select verification_status from public.reports where id = v_report) = 'confirmed',
      'cluster confirmation did not mark the report confirmed';

    select reports_confirmed into v_confirmed_after from public.profiles where id = v_user;
    assert v_confirmed_after = v_confirmed_before + 1,
      'reports_confirmed did not increment on cluster confirmation';

    delete from public.reports where id = v_report;
    delete from public.incident_clusters where id = v_cluster;
  end;

  -- Daily call ceiling counter.
  delete from public.ai_usage_log where user_id = v_user;
  select public.ai_calls_today(v_user) into v_calls;
  assert v_calls = 0, 'ai_calls_today should start at zero';

  insert into public.ai_usage_log (user_id, function_name, model, outcome)
  values (v_user, 'check-report-quality', 'claude-haiku-4-5', 'passed');
  select public.ai_calls_today(v_user) into v_calls;
  assert v_calls = 1, format('expected 1 call today, got %s', v_calls);

  delete from public.ai_usage_log where user_id = v_user;
end $$;
```

- [ ] **Step 2: Run it and watch it fail**

Expected: `FAIL 08_trust_and_usage.sql — column "reports_submitted" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260812120800_trust_foundation.sql`:

```sql
alter table public.profiles add column if not exists trust_score          integer not null default 50;
alter table public.profiles add column if not exists reports_submitted    integer not null default 0;
alter table public.profiles add column if not exists reports_confirmed    integer not null default 0;
alter table public.profiles add column if not exists reports_flagged_fake integer not null default 0;

alter table public.reports add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'confirmed', 'rejected'));

create table if not exists public.report_flags (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  flagger_id uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  unique (report_id, flagger_id)
);

alter table public.report_flags enable row level security;

drop policy if exists report_flags_insert_own on public.report_flags;
create policy report_flags_insert_own on public.report_flags
  for insert to authenticated with check (flagger_id = auth.uid());

create table if not exists public.ai_usage_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete set null,
  function_name         text not null,
  model                 text not null,
  input_tokens          integer,
  output_tokens         integer,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  latency_ms            integer,
  outcome               text not null,
  created_at            timestamptz not null default now()
);

create index if not exists ai_usage_log_user_day_idx
  on public.ai_usage_log (user_id, created_at desc);

-- RLS on with no policy: service role only.
alter table public.ai_usage_log enable row level security;

create or replace function public.ai_calls_today(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.ai_usage_log
   where user_id = p_user and created_at > date_trunc('day', now());
$$;

-- Signal recording only. No scoring formula in Spec 1, per brief §3.
create or replace function public.record_report_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles set reports_submitted = reports_submitted + 1
     where id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_record_report_submitted on public.reports;
create trigger trg_record_report_submitted
  after insert on public.reports
  for each row execute function public.record_report_submitted();

-- Corroboration is the only confirmation signal that exists in Spec 1: when a
-- cluster reaches enough DISTINCT reporters, its reports become 'confirmed'
-- and each reporter's counter goes up. Still no scoring formula — this only
-- records the history a future formula would read.
create or replace function public.record_cluster_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.reports set verification_status = 'confirmed'
     where cluster_id = new.id and verification_status = 'pending';

    update public.profiles p set reports_confirmed = p.reports_confirmed + 1
     where p.id in (select distinct r.user_id from public.reports r
                     where r.cluster_id = new.id and r.user_id is not null);
  end if;
  return new;
end $$;

drop trigger if exists trg_record_cluster_confirmation on public.incident_clusters;
create trigger trg_record_cluster_confirmation
  after update on public.incident_clusters
  for each row execute function public.record_cluster_confirmation();
```

- [ ] **Step 4: Apply and run the full suite**

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Expected: eight files `ok`, `All SQL tests passed.`

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(ai): trust-score foundation and AI usage log"
```

---

### Task 9: Edge Function — deterministic pre-filter

**Files:**
- Create: `supabase/functions/check-report-quality/prefilter.ts`
- Create: `supabase/functions/check-report-quality/prefilter_test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Category = "medical" | "fire" | "security" | "missing_person";
  export interface CheckInput {
    category: Category; description: string; address?: string | null;
    latitude?: number | null; longitude?: number | null; has_media?: boolean;
    last_seen_at?: string | null; police_reference?: string | null;
  }
  export interface PrefilterResult { ok: boolean; missing: string[]; feedback: string; }
  export function prefilter(input: CheckInput, minWords: number): PrefilterResult;
  export function wordCount(s: string): number;
  ```

- [ ] **Step 1: Write the failing test**

`supabase/functions/check-report-quality/prefilter_test.ts`:

```ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { prefilter, wordCount, type CheckInput } from "./prefilter.ts";

const base: CheckInput = {
  category: "security",
  description: "Two men on a motorcycle snatched a bag near the junction and rode north",
  latitude: 6.6, longitude: 3.35, has_media: true,
};

Deno.test("wordCount ignores extra whitespace", () => {
  assertEquals(wordCount("  one   two \n three "), 3);
});

Deno.test("a detailed report passes", () => {
  // base.description is 14 words, so it clears a threshold of 5.
  assertEquals(prefilter(base, 5).ok, true);
  assertEquals(prefilter(base, 5).missing, []);
});

Deno.test("the word threshold is respected", () => {
  // ...and fails one of 20.
  assertEquals(prefilter(base, 20).ok, false);
});

Deno.test("a two-word report is rejected without calling the model", () => {
  const r = prefilter({ ...base, description: "robbery" }, 15);
  assertEquals(r.ok, false);
  assert(r.missing.includes("description"));
  assert(r.feedback.length > 0);
});

Deno.test("missing_person requires all four fields", () => {
  const r = prefilter({ ...base, category: "missing_person", has_media: false }, 5);
  assertEquals(r.ok, false);
  assert(r.missing.includes("photo"));
  assert(r.missing.includes("last_seen_at"));
  assert(r.missing.includes("police_reference"));
});

Deno.test("missing_person with all four passes the prefilter", () => {
  const r = prefilter({
    ...base, category: "missing_person", has_media: true,
    last_seen_at: "2026-08-11T19:30:00Z", police_reference: "Ikeja/CR/1123",
  }, 5);
  assertEquals(r.ok, true);
  assertEquals(r.missing, []);
});

Deno.test("a report with no coordinates flags location", () => {
  const r = prefilter({ ...base, latitude: null, longitude: null }, 5);
  assertEquals(r.ok, false);
  assert(r.missing.includes("location"));
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/prefilter_test.ts
```

Expected: FAIL — `Module not found "./prefilter.ts"`.

- [ ] **Step 3: Implement it**

`supabase/functions/check-report-quality/prefilter.ts`:

```ts
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
  if (input.latitude == null || input.longitude == null) missing.push("location");

  if (input.category === "missing_person") {
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
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/prefilter_test.ts
```

Expected: `ok | 7 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/
git commit -m "feat(ai): deterministic report pre-filter"
```

---

### Task 10: Edge Function — the Claude call

**Files:**
- Create: `supabase/functions/check-report-quality/claude.ts`
- Create: `supabase/functions/check-report-quality/claude_test.ts`

**Interfaces:**
- Consumes: `CheckInput` from `prefilter.ts`
- Produces:
  ```ts
  export interface Verdict {
    verdict: "pass" | "needs_detail";
    missing: string[]; feedback: string;
    priority: "critical" | "high" | "medium" | "low";
    priority_reason: string;
  }
  export interface ClaudeOutcome {
    verdict: Verdict | null; degraded: boolean; error?: string;
    usage: { input_tokens: number; output_tokens: number }; latencyMs: number;
  }
  export const VERDICT_SCHEMA: Record<string, unknown>;
  export function buildUserMessage(input: CheckInput): string;
  export function parseVerdict(raw: string): Verdict;
  export function assessQuality(input: CheckInput, apiKey: string | undefined): Promise<ClaudeOutcome>;
  ```

- [ ] **Step 1: Write the failing test**

`supabase/functions/check-report-quality/claude_test.ts`:

```ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assessQuality, buildUserMessage, parseVerdict, VERDICT_SCHEMA,
} from "./claude.ts";
import type { CheckInput } from "./prefilter.ts";

const input: CheckInput = {
  category: "security", description: "Two men snatched a bag near the junction",
  latitude: 6.6, longitude: 3.35, has_media: true, address: "Allen Avenue",
};

Deno.test("the JSON schema forbids extra properties", () => {
  assertEquals((VERDICT_SCHEMA as { additionalProperties: boolean }).additionalProperties, false);
});

Deno.test("the user message carries every field the rubric needs", () => {
  const msg = buildUserMessage(input);
  assert(msg.includes("security"));
  assert(msg.includes("Allen Avenue"));
  assert(msg.includes("Two men snatched"));
});

Deno.test("parseVerdict accepts a well-formed response", () => {
  const v = parseVerdict(JSON.stringify({
    verdict: "needs_detail", missing: ["time"], feedback: "What time?",
    priority: "high", priority_reason: "ongoing",
  }));
  assertEquals(v.verdict, "needs_detail");
  assertEquals(v.priority, "high");
});

Deno.test("parseVerdict rejects an unknown priority", () => {
  assertThrows(() => parseVerdict(JSON.stringify({
    verdict: "pass", missing: [], feedback: "", priority: "urgent", priority_reason: "",
  })));
});

Deno.test("parseVerdict rejects non-JSON", () => {
  assertThrows(() => parseVerdict("Sure! Here is the JSON: {"));
});

Deno.test("a missing API key fails open rather than throwing", async () => {
  const out = await assessQuality(input, undefined);
  assertEquals(out.degraded, true);
  assertEquals(out.verdict, null);
  assert((out.error ?? "").length > 0);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/claude_test.ts
```

Expected: FAIL — `Module not found "./claude.ts"`.

- [ ] **Step 3: Implement it**

`supabase/functions/check-report-quality/claude.ts`:

```ts
import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import type { CheckInput } from "./prefilter.ts";

const MODEL = "claude-haiku-4-5";
const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export interface Verdict {
  verdict: "pass" | "needs_detail";
  missing: string[];
  feedback: string;
  priority: (typeof PRIORITIES)[number];
  priority_reason: string;
}

export interface ClaudeOutcome {
  verdict: Verdict | null;
  degraded: boolean;
  error?: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}

export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "missing", "feedback", "priority", "priority_reason"],
  properties: {
    verdict: { type: "string", enum: ["pass", "needs_detail"] },
    missing: {
      type: "array",
      items: {
        type: "string",
        enum: ["location", "time", "description", "evidence", "suspect", "direction"],
      },
    },
    feedback: { type: "string" },
    priority: { type: "string", enum: PRIORITIES },
    priority_reason: { type: "string" },
  },
} as const;

const RUBRIC = `You review incident reports for a Nigerian personal-safety app before they reach responders.

Decide whether a report carries enough ACTIONABLE detail: what happened, where, when, and who or what was involved.

Rules:
- "pass" when a responder could act on it. Do not demand perfect prose. People write these under stress, often on a phone, often in a hurry.
- "needs_detail" only when something genuinely actionable is absent.
- feedback must be ONE short question, under 140 characters, in plain warm English. Ask for the single most useful missing thing. Never scold.
- Assign priority by danger to life: critical = happening now with injury or a weapon; high = recent and violent; medium = property or past events; low = minor or advisory.
- Never invent details that are not in the report.`;

export function buildUserMessage(input: CheckInput): string {
  return [
    `Category: ${input.category}`,
    `Address: ${input.address ?? "(not supplied)"}`,
    `Coordinates: ${input.latitude ?? "?"}, ${input.longitude ?? "?"}`,
    `Media attached: ${input.has_media ? "yes" : "no"}`,
    input.last_seen_at ? `Last seen: ${input.last_seen_at}` : null,
    input.police_reference ? `Police reference: ${input.police_reference}` : null,
    "",
    "Report:",
    input.description,
  ].filter((l) => l !== null).join("\n");
}

export function parseVerdict(raw: string): Verdict {
  const v = JSON.parse(raw) as Verdict;
  if (v.verdict !== "pass" && v.verdict !== "needs_detail") {
    throw new Error(`unknown verdict: ${v.verdict}`);
  }
  if (!PRIORITIES.includes(v.priority)) {
    throw new Error(`unknown priority: ${v.priority}`);
  }
  return {
    ...v,
    missing: Array.isArray(v.missing) ? v.missing : [],
    feedback: String(v.feedback ?? "").slice(0, 140),
  };
}

/**
 * Never throws. Every failure path returns degraded=true so the caller fails
 * open — a broken dependency must not stand between someone and reporting an
 * emergency.
 *
 * Model notes (claude-haiku-4-5):
 *   - output_config.effort is NOT supported and errors. Do not add it.
 *   - thinking is omitted deliberately: this model does not think when omitted.
 *   - no cache_control: the minimum cacheable prefix is 4096 tokens and the
 *     rubric is far shorter, so it would silently never engage.
 */
export async function assessQuality(
  input: CheckInput,
  apiKey: string | undefined,
): Promise<ClaudeOutcome> {
  const started = Date.now();
  const empty = { input_tokens: 0, output_tokens: 0 };

  if (!apiKey) {
    return { verdict: null, degraded: true, error: "ANTHROPIC_API_KEY is not set",
             usage: empty, latencyMs: Date.now() - started };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 8_000, maxRetries: 1 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: RUBRIC,
      messages: [{ role: "user", content: buildUserMessage(input) }],
      output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
    } as never);

    const message = res as unknown as {
      stop_reason?: string;
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const usage = {
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    };

    if (message.stop_reason === "refusal") {
      return { verdict: null, degraded: true, error: "model refused",
               usage, latencyMs: Date.now() - started };
    }

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return { verdict: parseVerdict(text), degraded: false, usage,
             latencyMs: Date.now() - started };
  } catch (err) {
    return { verdict: null, degraded: true, error: (err as Error).message,
             usage: empty, latencyMs: Date.now() - started };
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/claude_test.ts
```

Expected: `ok | 6 passed | 0 failed`. The last test proves fail-open works with no key present.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/
git commit -m "feat(ai): Claude Haiku quality assessment with structured output"
```

---

### Task 11: Edge Function — database layer and handler

**Files:**
- Create: `supabase/functions/check-report-quality/db.ts`
- Create: `supabase/functions/check-report-quality/index.ts`
- Create: `supabase/functions/check-report-quality/index_test.ts`

**Interfaces:**
- Consumes: `prefilter`, `assessQuality`, `fingerprint`
- Produces: HTTP endpoint per spec §6.1; `decide()` — the pure orchestration function the tests drive

- [ ] **Step 1: Write the failing test**

`supabase/functions/check-report-quality/index_test.ts` — `decide()` is separated from I/O precisely so it can be tested without a network or a database.

```ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { decide, type DecideDeps } from "./index.ts";
import type { CheckInput } from "./prefilter.ts";

const input: CheckInput = {
  category: "security",
  description: "Two men on a motorcycle snatched a bag near the junction and rode north",
  latitude: 6.6, longitude: 3.35, has_media: true,
};

const settings = {
  quality_gate_mode: "advisory", strike_threshold: 3, strike_window_minutes: 15,
  ban_minutes: 30, daily_call_ceiling: 40, min_description_words: 5,
  dupe_radius_meters: 500, dupe_window_minutes: 60, cluster_confirm_count: 5,
};

function deps(over: Partial<DecideDeps> = {}): DecideDeps {
  return {
    settings,
    strikeState: () => Promise.resolve({ strike_count: 0, banned_until: null }),
    callsToday: () => Promise.resolve(0),
    assess: () => Promise.resolve({
      verdict: { verdict: "pass", missing: [], feedback: "", priority: "high", priority_reason: "x" },
      degraded: false, usage: { input_tokens: 10, output_tokens: 5 }, latencyMs: 12,
    }),
    mintToken: () => Promise.resolve({ token: "tok_x", expires_at: "2026-08-12T18:00:00Z" }),
    recordStrike: () => Promise.resolve(),
    logUsage: () => Promise.resolve(),
    ...over,
  };
}

Deno.test("a banned user is paused and no model call is made", async () => {
  let called = false;
  const out = await decide(input, "user-1", deps({
    strikeState: () => Promise.resolve({
      strike_count: 3, banned_until: "2026-08-12T18:05:00Z",
    }),
    assess: () => { called = true; throw new Error("must not be called"); },
  }));
  assertEquals(out.status, 429);
  assertEquals(out.body.status, "paused");
  assertEquals(called, false);
});

Deno.test("the pre-filter rejects without a model call and records a strike", async () => {
  let assessed = false, struck = false;
  const out = await decide({ ...input, description: "robbery" }, "user-1", deps({
    assess: () => { assessed = true; throw new Error("must not be called"); },
    recordStrike: () => { struck = true; return Promise.resolve(); },
  }));
  assertEquals(out.body.status, "needs_detail");
  assertEquals(assessed, false);
  assertEquals(struck, true);
});

Deno.test("a pass mints a token and returns the priority", async () => {
  const out = await decide(input, "user-1", deps());
  assertEquals(out.status, 200);
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.token, "tok_x");
  assertEquals(out.body.priority, "high");
  assertEquals(out.body.quality_status, "passed");
});

Deno.test("needs_detail returns feedback, no token, and a strike", async () => {
  let struck = false;
  const out = await decide(input, "user-1", deps({
    assess: () => Promise.resolve({
      verdict: { verdict: "needs_detail", missing: ["time"], feedback: "What time?",
                 priority: "medium", priority_reason: "" },
      degraded: false, usage: { input_tokens: 10, output_tokens: 5 }, latencyMs: 9,
    }),
    recordStrike: () => { struck = true; return Promise.resolve(); },
  }));
  assertEquals(out.body.status, "needs_detail");
  assertEquals(out.body.feedback, "What time?");
  assert(out.body.token === undefined);
  assertEquals(struck, true);
});

Deno.test("a degraded model call fails OPEN with a token", async () => {
  const out = await decide(input, "user-1", deps({
    assess: () => Promise.resolve({
      verdict: null, degraded: true, error: "timeout",
      usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: 8000,
    }),
  }));
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.quality_status, "skipped_ai_unavailable");
  assertEquals(out.body.token, "tok_x");
});

Deno.test("over the daily ceiling fails OPEN without a model call", async () => {
  let assessed = false;
  const out = await decide(input, "user-1", deps({
    callsToday: () => Promise.resolve(40),
    assess: () => { assessed = true; throw new Error("must not be called"); },
  }));
  assertEquals(out.body.status, "pass");
  assertEquals(out.body.quality_status, "skipped_quota");
  assertEquals(assessed, false);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/index_test.ts
```

Expected: FAIL — `Module not found "./index.ts"`.

- [ ] **Step 3: Write the database layer**

`supabase/functions/check-report-quality/db.ts`:

```ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fingerprint } from "../_shared/fingerprint.ts";
import type { CheckInput } from "./prefilter.ts";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function loadSettings(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("*").limit(1).maybeSingle();
  return data;
}

export async function strikeState(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("strike_state", { p_user: userId });
  const row = Array.isArray(data) ? data[0] : data;
  return { strike_count: row?.strike_count ?? 0, banned_until: row?.banned_until ?? null };
}

export async function callsToday(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.rpc("ai_calls_today", { p_user: userId });
  return typeof data === "number" ? data : 0;
}

export async function recordStrike(db: SupabaseClient, userId: string, reason: string) {
  await db.rpc("record_strike", { p_user: userId, p_reason: reason });
}

export async function logUsage(db: SupabaseClient, row: Record<string, unknown>) {
  await db.from("ai_usage_log").insert(row);
}

export async function mintToken(
  db: SupabaseClient, userId: string, input: CheckInput,
  verdict: "passed" | "skipped_ai_unavailable" | "skipped_quota",
  priority: string | null,
) {
  const token = `sq_${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenSha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();

  await db.from("report_quality_tokens").insert({
    user_id: userId,
    token_sha256: tokenSha,
    payload_fingerprint: await fingerprint(input.category, input.description),
    verdict, priority, expires_at: expires,
  });

  return { token, expires_at: expires };
}
```

- [ ] **Step 4: Write the handler**

`supabase/functions/check-report-quality/index.ts`:

```ts
import { assessQuality, type ClaudeOutcome } from "./claude.ts";
import { prefilter, type CheckInput } from "./prefilter.ts";
import * as db from "./db.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface DecideDeps {
  settings: Record<string, number | string>;
  strikeState: (userId: string) => Promise<{ strike_count: number; banned_until: string | null }>;
  callsToday: (userId: string) => Promise<number>;
  assess: (input: CheckInput) => Promise<ClaudeOutcome>;
  mintToken: (userId: string, input: CheckInput, verdict: string, priority: string | null)
    => Promise<{ token: string; expires_at: string }>;
  recordStrike: (userId: string, reason: string) => Promise<void>;
  logUsage: (row: Record<string, unknown>) => Promise<void>;
}

// deno-lint-ignore no-explicit-any
export interface Decision { status: number; body: any }

/** Pure orchestration — no network, no database. Every branch is unit-tested. */
export async function decide(
  input: CheckInput, userId: string, d: DecideDeps,
): Promise<Decision> {
  const ban = await d.strikeState(userId);
  if (ban.banned_until) {
    return { status: 429, body: {
      status: "paused", retry_at: ban.banned_until,
      message: "Too many incomplete reports. Please try again shortly.",
    } };
  }

  const pre = prefilter(input, Number(d.settings.min_description_words));
  if (!pre.ok) {
    await d.recordStrike(userId, "failed_prefilter");
    await d.logUsage({ user_id: userId, function_name: "check-report-quality",
                       model: "none", outcome: "failed_prefilter" });
    const after = await d.strikeState(userId);
    return { status: 200, body: {
      status: "needs_detail", missing: pre.missing, feedback: pre.feedback,
      strikes: { count: after.strike_count, threshold: Number(d.settings.strike_threshold) },
    } };
  }

  // Fail open past the daily ceiling: cap runaway spend, never block a person.
  if (await d.callsToday(userId) >= Number(d.settings.daily_call_ceiling)) {
    const t = await d.mintToken(userId, input, "skipped_quota", null);
    await d.logUsage({ user_id: userId, function_name: "check-report-quality",
                       model: "none", outcome: "skipped_quota" });
    return { status: 200, body: { status: "pass", token: t.token,
      expires_at: t.expires_at, priority: "medium", quality_status: "skipped_quota" } };
  }

  const out = await d.assess(input);
  await d.logUsage({
    user_id: userId, function_name: "check-report-quality", model: "claude-haiku-4-5",
    input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens,
    latency_ms: out.latencyMs,
    outcome: out.degraded ? `degraded:${out.error ?? "unknown"}`.slice(0, 200)
                          : out.verdict!.verdict,
  });

  if (out.degraded || !out.verdict) {
    const t = await d.mintToken(userId, input, "skipped_ai_unavailable", null);
    return { status: 200, body: { status: "pass", token: t.token,
      expires_at: t.expires_at, priority: "medium",
      quality_status: "skipped_ai_unavailable" } };
  }

  if (out.verdict.verdict === "needs_detail") {
    await d.recordStrike(userId, "needs_detail");
    const after = await d.strikeState(userId);
    return { status: 200, body: {
      status: "needs_detail", missing: out.verdict.missing, feedback: out.verdict.feedback,
      strikes: { count: after.strike_count, threshold: Number(d.settings.strike_threshold) },
    } };
  }

  const t = await d.mintToken(userId, input, "passed", out.verdict.priority);
  return { status: 200, body: { status: "pass", token: t.token, expires_at: t.expires_at,
    priority: out.verdict.priority, quality_status: "passed" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const client = db.serviceClient();
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: auth } = await client.auth.getUser(jwt);
    if (!auth?.user) return json({ error: "unauthorized" }, 401);

    const input = (await req.json()) as CheckInput;
    const settings = await db.loadSettings(client);
    if (!settings) return json({ error: "app_settings missing" }, 500);

    const decision = await decide(input, auth.user.id, {
      settings,
      strikeState: (u) => db.strikeState(client, u),
      callsToday: (u) => db.callsToday(client, u),
      assess: (i) => assessQuality(i, Deno.env.get("ANTHROPIC_API_KEY")),
      mintToken: (u, i, v, p) =>
        db.mintToken(client, u, i, v as "passed", p),
      recordStrike: (u, r) => db.recordStrike(client, u, r),
      logUsage: (row) => db.logUsage(client, row),
    });

    return json(decision.body, decision.status);
  } catch (err) {
    // Last-resort fail-open is NOT possible here (no user context), so surface
    // the error; the client's own catch turns it into a degraded pass.
    return json({ error: (err as Error).message }, 500);
  }
});
```

- [ ] **Step 5: Run the tests and the type check**

```bash
npx deno@2 test -A supabase/functions/check-report-quality/index_test.ts
npx deno@2 check supabase/functions/check-report-quality/index.ts
```

Expected: `ok | 6 passed | 0 failed`, and a clean `check`.

> `Deno.serve` runs at import time, so `index_test.ts` will start a listener.
> If that causes a port conflict in your environment, move `Deno.serve(...)` into
> `main.ts` that imports `decide` — but try it first; Deno's test runner
> usually tolerates it.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/
git commit -m "feat(ai): check-report-quality handler with fail-open orchestration"
```

---

### Task 12: Rehearsal deploy, smoke test, and runbook

**Files:**
- Create: `supabase/AI_PIPELINE.md`

- [ ] **Step 1: Set the secret on the rehearsal project**

```bash
npx supabase@2.114.0 secrets set ANTHROPIC_API_KEY=sk-ant-… --project-ref <rehearsal-ref>
```

- [ ] **Step 2: Deploy the function**

```bash
npx supabase@2.114.0 functions deploy check-report-quality --project-ref <rehearsal-ref>
```

JWT verification stays **on**. Do not pass `--no-verify-jwt`: the function writes strikes against the caller and binds tokens to their user id.

- [ ] **Step 3: Smoke-test a pass**

Get a real user access token by signing in on the app against the rehearsal project, or from Dashboard → Authentication → Users → impersonate.

```bash
curl -s -X POST "https://<rehearsal-ref>.supabase.co/functions/v1/check-report-quality" \
  -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"category":"security","description":"Two men on a motorcycle snatched a bag near Allen Avenue junction around 7pm and rode north","address":"Allen Avenue","latitude":6.6,"longitude":3.35,"has_media":false}'
```

Expected: `{"status":"pass","token":"sq_…","priority":"…","quality_status":"passed"}`.

- [ ] **Step 4: Smoke-test a rejection**

```bash
curl -s -X POST "https://<rehearsal-ref>.supabase.co/functions/v1/check-report-quality" \
  -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"category":"security","description":"robbery","latitude":6.6,"longitude":3.35}'
```

Expected: `{"status":"needs_detail","missing":["description"],…,"strikes":{"count":1,"threshold":3}}`.

- [ ] **Step 5: Confirm the usage log is recording**

```sql
select model, outcome, input_tokens, output_tokens, latency_ms
  from public.ai_usage_log order by created_at desc limit 5;
```

Expected: rows for both calls. This is the number that replaces the spec's cost estimate.

- [ ] **Step 6: Write the runbook**

`supabase/AI_PIPELINE.md` — deploy order, secret names, the `app_settings` tunables table, the kill switch (`update public.app_settings set quality_gate_mode = 'advisory'`), the two §7.4 monitoring queries, and a note that the brief specifies Gemini while the implementation uses Claude Haiku 4.5.

- [ ] **Step 7: Commit**

```bash
git add supabase/AI_PIPELINE.md
git commit -m "docs(ai): deploy runbook for the report quality pipeline"
```

---

### Task 13: Client — the quality-check wrapper

**Files:**
- Create: `src/lib/reportQuality.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Priority = 'critical' | 'high' | 'medium' | 'low';
  export type QualityVerdict =
    | { status: 'pass'; token: string | null; priority: Priority; degraded: boolean }
    | { status: 'needs_detail'; missing: string[]; feedback: string; strikesLeft: number }
    | { status: 'paused'; retryAt: string };
  export async function checkReportQuality(input: QualityInput): Promise<QualityVerdict>;
  ```

- [ ] **Step 1: Write the module**

```ts
import { supabase } from './supabase';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type QualityInput = {
  category: string;
  description: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hasMedia: boolean;
  lastSeenAt?: string | null;
  policeReference?: string | null;
};

export type QualityVerdict =
  | { status: 'pass'; token: string | null; priority: Priority; degraded: boolean }
  | { status: 'needs_detail'; missing: string[]; feedback: string; strikesLeft: number }
  | { status: 'paused'; retryAt: string };

/**
 * Never throws. A network failure returns a degraded pass, because a dropped
 * connection must not become a wall between someone and reporting an emergency.
 */
export async function checkReportQuality(input: QualityInput): Promise<QualityVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke('check-report-quality', {
      body: {
        category: input.category,
        description: input.description,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        has_media: input.hasMedia,
        last_seen_at: input.lastSeenAt ?? null,
        police_reference: input.policeReference ?? null,
      },
    });

    if (error || !data) {
      console.warn('[reportQuality] invoke failed, failing open:', error?.message);
      return { status: 'pass', token: null, priority: 'medium', degraded: true };
    }

    if (data.status === 'paused') {
      return { status: 'paused', retryAt: data.retry_at };
    }

    if (data.status === 'needs_detail') {
      const count = data.strikes?.count ?? 0;
      const threshold = data.strikes?.threshold ?? 3;
      return {
        status: 'needs_detail',
        missing: data.missing ?? [],
        feedback: data.feedback ?? 'Please add a little more detail.',
        strikesLeft: Math.max(0, threshold - count),
      };
    }

    return {
      status: 'pass',
      token: data.token ?? null,
      priority: (data.priority ?? 'medium') as Priority,
      degraded: data.quality_status !== 'passed',
    };
  } catch (err) {
    console.warn('[reportQuality] threw, failing open:', err);
    return { status: 'pass', token: null, priority: 'medium', degraded: true };
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reportQuality.ts
git commit -m "feat(ai): client wrapper for the report quality check"
```

---

### Task 14: Client — `useReport` returns a structured result

**Files:**
- Modify: `src/hooks/useReport.ts` (whole file)

**Interfaces:**
- Consumes: `checkReportQuality`
- Produces:
  ```ts
  export type SubmitResult =
    | { ok: true; degraded: boolean }
    | { ok: false; reason: 'quality'; missing: string[]; feedback: string; strikesLeft: number }
    | { ok: false; reason: 'paused'; retryAt: string }
    | { ok: false; reason: 'gate'; code: string; message: string }
    | { ok: false; reason: 'error' };
  ```

- [ ] **Step 1: Add the types and the check, above `submitReport`**

```ts
import { checkReportQuality } from '../lib/reportQuality';

export type SubmitResult =
  | { ok: true; degraded: boolean }
  | { ok: false; reason: 'quality'; missing: string[]; feedback: string; strikesLeft: number }
  | { ok: false; reason: 'paused'; retryAt: string }
  | { ok: false; reason: 'gate'; code: string; message: string }
  | { ok: false; reason: 'error' };

const GATE_MESSAGES: Record<string, string> = {
  QUALITY_GATE_MISSING_PERSON_PHOTO: 'A missing-person report needs a recent photo.',
  QUALITY_GATE_MISSING_PERSON_LAST_SEEN: 'Please add when the person was last seen.',
  QUALITY_GATE_MISSING_PERSON_POLICE_REF: 'Please add the police station and case reference.',
  QUALITY_GATE_MISSING_PERSON_LOCATION: 'We need the location where they were last seen.',
};
```

Extend `ReportPayload` with the two optional fields:

```ts
export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
  latitude?: number | null;
  longitude?: number | null;
  lastSeenAt?: string | null;
  policeReference?: string | null;
};
```

- [ ] **Step 2: Change the signature and run the check first**

Replace `const submitReport = async (payload: ReportPayload): Promise<boolean> => {` with
`const submitReport = async (payload: ReportPayload): Promise<SubmitResult> => {`, and insert
immediately after `setLoading(true);` and the session lookup:

```ts
      // Quality check runs on TEXT ONLY, before the upload — a rejected report
      // should not cost the user a video upload first.
      const verdict = await checkReportQuality({
        category: payload.category,
        description: payload.details,
        address: payload.address,
        latitude: payload.latitude,
        longitude: payload.longitude,
        hasMedia: (payload.media?.length ?? 0) > 0,
        lastSeenAt: payload.lastSeenAt,
        policeReference: payload.policeReference,
      });

      if (verdict.status === 'paused') {
        setLoading(false);
        return { ok: false, reason: 'paused', retryAt: verdict.retryAt };
      }
      if (verdict.status === 'needs_detail') {
        setLoading(false);
        return {
          ok: false, reason: 'quality', missing: verdict.missing,
          feedback: verdict.feedback, strikesLeft: verdict.strikesLeft,
        };
      }
```

- [ ] **Step 3: Carry the token and new fields into the insert**

In `insertPayload`, add:

```ts
        quality_token: verdict.token,
        last_seen_at: payload.lastSeenAt ?? null,
        police_reference: payload.policeReference ?? null,
```

- [ ] **Step 4: Replace every `return true` / `return false` in the function**

- The early `if (!session?.user)` guard → `return { ok: false, reason: 'error' };`
- The `if (reportError || !report)` branch → map gate errors:

```ts
      if (reportError || !report) {
        setLoading(false);
        const code = Object.keys(GATE_MESSAGES).find((k) =>
          (reportError?.message ?? '').includes(k));
        if (code) {
          return { ok: false, reason: 'gate', code, message: GATE_MESSAGES[code] };
        }
        console.error('[useReport] Report insert failed:', reportError?.message);
        return { ok: false, reason: 'error' };
      }
```

- The success path → `return { ok: true, degraded: verdict.degraded };`
- The outer `catch` → `return { ok: false, reason: 'error' };`

- [ ] **Step 5: Type-check and lint**

```bash
npx tsc --noEmit
npx expo lint
```

Expected: `tsc` reports an error in `app/(tabs)/report.tsx` — `success` is no longer a boolean. That is the next task; do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useReport.ts
git commit -m "feat(ai): useReport runs the quality check and returns a structured result"
```

---

### Task 15: Client — report screen wiring and the missing-person category

**Files:**
- Modify: `app/(tabs)/report.tsx:16` (type), `:18-43` (categories), `:49-63` (state), `:292-324` (submit handler)

- [ ] **Step 1: Extend the category type and list**

Line 16:

```ts
type IncidentType = 'medical' | 'fire' | 'security' | 'missing_person';
```

Append to `INCIDENT_CATEGORIES` (after the `security` entry, before the closing `];`):

```ts
  {
    id: 'missing_person',
    label: 'Missing Person',
    icon: 'account-search-outline',
    color: '#7A5AF8',
    bgColor: '#F4F3FF',
    darkBgColor: '#2A2342',
  },
```

- [ ] **Step 2: Add state for the two new fields**

After line 63 (`const [locationDetails, setLocationDetails] = useState('');`):

```ts
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  const [policeReference, setPoliceReference] = useState('');
```

- [ ] **Step 3: Render the fields when the category is missing_person**

Inside the details step, immediately before the submit button, add:

```tsx
  {selectedType === 'missing_person' && (
    <View style={{ marginTop: 16, gap: 12 }}>
      <Text style={styles.stepText}>When were they last seen?</Text>
      <DateTimePicker
        value={lastSeenAt ?? new Date()}
        mode="datetime"
        maximumDate={new Date()}
        onChange={(_e, d) => d && setLastSeenAt(d)}
      />
      <Text style={styles.stepText}>Police station and case reference</Text>
      <TextInput
        value={policeReference}
        onChangeText={setPoliceReference}
        placeholder="e.g. Ikeja Division / CR-1123"
        placeholderTextColor={colors.text.secondary}
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 12,
          padding: 12, color: colors.text.primary, backgroundColor: colors.white,
        }}
      />
      <Text style={{ fontSize: 12, color: colors.text.secondary }}>
        A photo, the time last seen, the location, and a police reference are all
        required before a missing-person report can be filed.
      </Text>
    </View>
  )}
```

Add the import at the top: `import DateTimePicker from '@react-native-community/datetimepicker';` (already a dependency at `8.4.4`).

- [ ] **Step 4: Rewrite the submit handler (lines 292–324)**

```tsx
  const handleSubmit = async () => {
    if (!selectedType) {
      setErrorModal({ visible: true, title: 'Missing Info',
        message: 'Please select an incident type.' });
      return;
    }
    const combinedDetails = locationDetails.trim()
      ? `Location Note: ${locationDetails.trim()}\n\nIncident Details: ${detailsText}`
      : detailsText;

    const result = await submitReport({
      category: selectedType,
      address: address,
      details: combinedDetails,
      isAnonymous,
      media: mediaFiles,
      latitude: location?.coords.latitude,
      longitude: location?.coords.longitude,
      lastSeenAt: selectedType === 'missing_person' ? lastSeenAt?.toISOString() ?? null : null,
      policeReference: selectedType === 'missing_person' ? policeReference.trim() : null,
    });

    if (result.ok) {
      setSuccessModalVisible(true);
      return;
    }

    switch (result.reason) {
      case 'quality':
        setErrorModal({ visible: true, title: 'A bit more detail, please',
          message: result.strikesLeft <= 1
            ? `${result.feedback}\n\nOne more incomplete report will pause submissions for a short while.`
            : result.feedback });
        break;
      case 'paused':
        setErrorModal({ visible: true, title: 'Submissions paused',
          message: 'Too many incomplete reports. Please try again in a little while. SOS still works normally.' });
        break;
      case 'gate':
        setErrorModal({ visible: true, title: 'Missing required information',
          message: result.message });
        break;
      default:
        setErrorModal({ visible: true, title: 'Error',
          message: 'Failed to submit report. Please try again.' });
    }
  };
```

- [ ] **Step 5: Reset the new fields on success**

In `handleCloseSuccess` (line 326), add before the closing brace:

```ts
    setLastSeenAt(null);
    setPoliceReference('');
```

- [ ] **Step 6: Type-check and lint**

```bash
npx tsc --noEmit
npx expo lint
```

Expected: both clean.

- [ ] **Step 7: Run the app and submit a real report**

```bash
npx expo start --clear
```

Verify by hand: a two-word report shows the feedback modal; a detailed report submits; selecting **Missing Person** reveals the two fields; SOS still fires after three rejections.

- [ ] **Step 8: Commit**

```bash
git add app/\(tabs\)/report.tsx
git commit -m "feat(ai): wire report screen to the quality check, add missing-person category"
```

---

### Task 16: Production rollout

- [ ] **Step 1: Run the full verification suite**

```bash
npx deno@2 test -A supabase/functions/
npx deno@2 check supabase/functions/check-report-quality/index.ts
npx tsc --noEmit
npx expo lint
npx deno@2 run -A supabase/tests/run_sql_tests.ts    # still against REHEARSAL
```

All five must pass before touching production.

- [ ] **Step 2: Apply migrations to production (advisory mode)**

```bash
npx supabase@2.114.0 db push --project-ref ujbknxfvatvtwthxtytu
```

Nothing user-visible changes: the gate records verdicts and admits every row.

- [ ] **Step 3: Set the production secret and deploy**

```bash
npx supabase@2.114.0 secrets set ANTHROPIC_API_KEY=sk-ant-… --project-ref ujbknxfvatvtwthxtytu
npx supabase@2.114.0 functions deploy check-report-quality --project-ref ujbknxfvatvtwthxtytu
```

- [ ] **Step 4: Confirm advisory mode before shipping the app**

```sql
select quality_gate_mode from public.app_settings;   -- must be 'advisory'
```

- [ ] **Step 5: Ship the app build**

```bash
eas build --profile preview --platform android
```

- [ ] **Step 6: Watch for several days, then decide**

```sql
select quality_status, gate_reason, count(*)
  from public.reports
 where created_at > now() - interval '7 days'
 group by 1, 2 order by 3 desc;

select count(*), avg(input_tokens), avg(output_tokens), avg(latency_ms),
       percentile_cont(0.95) within group (order by latency_ms) as p95_ms
  from public.ai_usage_log
 where created_at > now() - interval '7 days';
```

Flip only when the `gate_reason` distribution shows no legitimate reports being caught:

```sql
update public.app_settings set quality_gate_mode = 'enforcing';
```

Kill switch, if enforcement misbehaves:

```sql
update public.app_settings set quality_gate_mode = 'advisory';
```

- [ ] **Step 7: Verify the spec's acceptance criteria**

1. `tsc --noEmit` and `expo lint` clean.
2. `deno check` clean.
3. A report passing and failing end to end against the deployed function.
4. `ai_usage_log` populated with real token counts.
5. A missing-person report missing any of the four fields rejected **with `ANTHROPIC_API_KEY` unset** — proving the deterministic half holds without Claude.
6. SOS fires for a user carrying three strikes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(ai): production rollout of the report quality pipeline"
```
