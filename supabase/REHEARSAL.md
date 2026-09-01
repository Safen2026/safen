# Rehearsing the AI pipeline migrations

None of the eight migrations in `supabase/migrations/` has ever been executed.
They were verified by reading only. This runbook applies them to a throwaway
project first, so a typo in a `BEFORE INSERT` trigger on `reports` is found
there rather than on the live table every user submits through.

Nothing here touches production except one **read-only** schema dump.

---

## 0. Why a bare project is not enough

`public.profiles`, `public.reports` and `public.alerts` were created in the
Supabase dashboard, not by migrations — there is no migration in this repo that
creates them. All eight of our migrations `ALTER` those tables, so on an empty
project the very first one fails with *relation "public.reports" does not
exist*. Step 2 replicates the baseline schema first.

## 1. Create the throwaway project

Supabase dashboard → New project. Free tier is fine. Note its database password.

Then collect two connection strings (Project Settings → Database → Connection
string → URI), and keep them straight — one is production:

```bash
export PROD_DB_URL="postgresql://postgres.ujbknxfvatvtwthxtytu:…"   # read-only use
export SUPABASE_DB_URL="postgresql://postgres.<rehearsal-ref>:…"    # everything else
```

> Every command below except step 2's dump uses `SUPABASE_DB_URL`. If you only
> export one variable, export the rehearsal one.

## 2. Copy the baseline schema (read-only against production)

```bash
npx supabase@2.114.0 db dump --db-url "$PROD_DB_URL" \
  --schema public -f supabase/rehearsal/baseline.sql
```

`db dump` reads; it does not write. Skim the output before applying it —
it should contain `create table … profiles`, `… reports`, `… alerts`, and
should NOT contain any of our new objects (`report_quality_tokens`,
`incident_clusters`, `app_settings`). If it does, someone has already applied
the migrations to production and you should stop and reassess.

```bash
npx deno@2 run -A supabase/rehearsal/apply.ts supabase/rehearsal/baseline.sql
```

## 3. Apply our migrations

```bash
npx supabase@2.114.0 db push --db-url "$SUPABASE_DB_URL"
```

Expect eight files applied in filename order. **This is the step most likely to
fail**, and that is the entire point of doing it here.

## 4. Run the suite

```bash
npx deno@2 run -A supabase/tests/run_sql_tests.ts
```

Eleven files: `00_seed` (creates three reporters — the cluster tests need three
distinct ones), then `01`–`10`. Every file must print `ok`.

## 5. Two things to check by hand while you are connected

Neither is covered by the suite and both could bite in production:

```sql
-- (a) Collation. SQL lower() is locale-dependent; JS toLowerCase() is full
-- Unicode. If these disagree, the TS/SQL fingerprint invariant breaks on
-- Yoruba/Igbo diacritics and legitimate reports get rejected once enforcing.
select lower('ẸGBẸ́'), lower('ODÙDÙWÀ');

-- (b) Does profiles actually reference auth.users? DATABASE_SCHEMA.md lists
-- this as an open question and the seed handles both answers.
select conname, confrelid::regclass
  from pg_constraint
 where conrelid = 'public.profiles'::regclass and contype = 'f';
```

## 6. Then, and only then, production

Per the plan's Task 16 — and note the order, database ahead of client:

```bash
npx supabase@2.114.0 db push                       # advisory mode: records, admits
npx supabase@2.114.0 secrets set ANTHROPIC_API_KEY=sk-ant-…
npx supabase@2.114.0 functions deploy check-report-quality
# then ship the app build
```

Kill switch, at any point:

```sql
update public.app_settings set quality_gate_mode = 'advisory';
```

> Reverting to `advisory` disables the DB gate's rejections. Strikes and the
> 429 pause are also gated on enforcing mode (fixed in `c714caf`), so this is a
> complete stop. The four missing-person requirements still raise in both
> modes — deliberately, since they never depended on the AI.

## Known gaps this rehearsal will NOT cover

- `assessQuality`'s network/timeout branches. The refusal and response-parsing
  branches are now covered in `claude_test.ts` by stubbing `globalThis.fetch`;
  timeout and connection failure still are not.
- Concurrency: the `FOR UPDATE` token race was reasoned through, not exercised.
  Two simultaneous submits with one token would be the test.
