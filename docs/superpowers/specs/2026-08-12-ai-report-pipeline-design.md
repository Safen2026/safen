# Safen AI report pipeline — Spec 1: the submit path

**Date:** 2026-08-12
**Status:** approved design, not yet implemented
**Source:** *Safen Backend Developer Brief — AI Features and Scope* (internal, 2026-08-02)

Covers brief features 1 (report quality check), 2 (priority triage), 3 (spam
prevention, rate limiting, duplicate grouping), and the §3 trust-score
foundation. Feature 4 (community safety feed) is deferred to Spec 2.

---

## 1. Why this split

The brief lists four features to build now. Features 1–3 are one subsystem, not
three: triage fires on the same INSERT the quality gate guards, strikes are
produced by quality-check failures, and clustering keys off the row the gate
just admitted. Splitting them mid-way leaves half-wired triggers on a live
table.

Feature 4 is genuinely separate — a scheduled job on a different trigger (cron),
with a different failure mode (nothing worth summarising), and the brief's own
§3 notes its "verified reports" filter depends on corroboration data that does
not exist until reports are flowing. Building it now means building against an
empty table.

**Not in this spec, deliberately:**

- Feature 4, community safety feed → Spec 2.
- Feature 5, proximity warnings → BUILD LATER per the brief; needs report volume.
- Feature 6, news / X scraping → DO NOT BUILD per the brief.
- Trust *scoring*. Columns and signal recording only, per brief §3. No formula,
  no corroboration queue, no shadow-ban.
- `SafetyFeed` keeps its `MOCK_FEED`; `AIRiskCard` stays a mocked demo. Both are
  Spec 2. Leaving them visibly fake beats half-wiring them to an empty table.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Design from scratch; the `stash@{0}` implementation on `ai-assistant` is left untouched | User's call. The stash stays as a safety net; nothing is inherited from it. |
| 2 | **Claude** (`claude-haiku-4-5`), not Gemini | Diverges from the brief, which specifies Gemini. The Anthropic key already exists; Haiku is fast, and latency sits in front of a submit button. **Tell the backend dev** — the brief is now out of date on this point. |
| 3 | Backend + thin client wiring | Edge Function, migrations and prompts, plus the minimum frontend to prove it end-to-end. UI polish out of scope. |
| 4 | Missing-person rules enforced by **structured columns + a database gate** | Deterministic. Still enforced when Claude is unreachable. Costs two new form fields. |
| 5 | Gate ships **advisory-first**, enforcement behind a flag | Every already-installed build submits without a token. Enforcing on day one breaks them all until users update. |
| 6 | Per-user **daily call ceiling that fails open** | Caps a runaway account without ever standing between a real person and filing a report. |
| 7 | Triage runs **inside** the quality-check call, not a second webhook | Same read of the same text. One extra output field instead of a second API call, a webhook to configure, and a second failure mode. A manual re-score endpoint covers rows that bypass the function. |
| 8 | Duplicate clustering uses **plain haversine**, not PostGIS | Deviation from the brief. A lat/lng bounding-box prefilter on a btree index plus a distance check is adequate at pilot scale, with no extension to enable and no GiST index to maintain. PostGIS is the upgrade path when volume justifies it. |

---

## 3. Architecture

```
app: checkReportQuality(category, description, address, has_media, …)
      │            POST /functions/v1/check-report-quality   (JWT verified)
      ▼
Edge Function ── Claude (structured output) ──▶ { verdict, missing[], feedback, priority }
      │
      ├─ pass  → mint token: random secret, sha256 stored in report_quality_tokens,
      │           bound to user_id + sha256(normalised category + description)
      ├─ fail  → record a strike, return feedback, NO token
      └─ error → fail open: synthetic pass + token, quality_status records why
      ▼
app: upload media to Cloudinary → INSERT into reports (… quality_token,
                                    last_seen_at, police_reference)
      ▼
trg_report_quality_gate (BEFORE INSERT)     ← advisory or enforcing, per app_settings
      ├─ token unknown / used / expired / wrong user / text changed → reject (or log)
      ├─ missing_person lacking photo, last_seen_at, police_reference,
      │    or coordinates                                           → reject (or log)
      └─ ok → mark token used, blank the column, stamp quality_checked_at,
              write priority
      ▼
trg_cluster_report (AFTER INSERT) → haversine match against recent nearby
                                     same-category reports
```

### 3.1 Why a token

The check and the write are two separate HTTP calls, and between them the client
uploads media to Cloudinary — which can take seconds. Binding the token to a
fingerprint of the text that was actually approved is what stops a client
getting a pass on innocuous text and then inserting something else.

**Fingerprint normalisation must be identical on both sides** — collapse
internal whitespace, then trim, then lowercase. The TypeScript helper in the
Edge Function and the SQL function used by the trigger have to agree byte for
byte; if they drift, every gated insert fails.

Token TTL is 15 minutes — comfortably longer than the slowest plausible media
upload.

### 3.2 Fail-open

Every AI-shaped failure lets the report through: API error, timeout, refusal,
unparseable response, unset key, over-quota. A broken dependency must never
stand between someone and reporting an emergency.

What stays enforced through an outage is the deterministic half — the gate still
requires a token, and still requires the four missing-person fields.

### 3.3 SOS is never touched

SOS and emergency alerts write to `public.alerts`. Nothing in this pipeline
touches that table: no quality check, no strikes, no ban, no triage, no trigger.
A user carrying three strikes can still fire an SOS. This is an explicit
acceptance test, not an assumption.

---

## 4. Schema

Six additive migrations. Nothing existing is dropped or retyped. All written
`if not exists` / `create or replace` so a partial failure is safely re-runnable.

| File | Adds |
|---|---|
| `20260812120000_report_quality_gate.sql` | `report_quality_tokens`, `reports.quality_token` / `quality_checked_at` / `quality_status`, fingerprint fn, the BEFORE INSERT gate |
| `20260812120100_report_triage.sql` | `report_priority` enum, `reports.priority` / `priority_rank` / `triage_reason` |
| `20260812120200_missing_person_fields.sql` | `reports.last_seen_at`, `reports.police_reference`, gate clause |
| `20260812120300_spam_prevention.sql` | `report_strikes`, ban derivation fn, `app_settings` |
| `20260812120400_incident_clusters.sql` | `incident_clusters`, `reports.cluster_id`, haversine fn, AFTER INSERT clustering trigger |
| `20260812120500_trust_foundation.sql` | `profiles.trust_score` + counters, `reports.verification_status`, `report_flags`, `ai_usage_log` |

### 4.1 Tables

**`report_quality_tokens`** — `id`, `user_id` → `profiles.id`, `token_sha256`
(unique), `payload_fingerprint`, `verdict`, `priority`, `expires_at`, `used_at`,
`created_at`. Plaintext token is returned to the client once and never stored.
No client-facing RLS policy at all; service role only.

**`report_strikes`** — one row per failed check: `id`, `user_id`, `reason`,
`created_at`. Ban state is **derived**, not stored: `count(*)` inside the window
≥ threshold means banned until `last strike + ban_minutes`. No expiry job, and
no stuck ban state to clean up.

**`incident_clusters`** — `id`, `category`, `centroid_lat`, `centroid_lng`,
`first_reported_at`, `last_reported_at`, `report_count`,
`distinct_reporter_count`, `confirmed_at`. A cluster is confirmed when distinct
reporters reach `cluster_confirm_count` (brief: 5).

**`ai_usage_log`** — `id`, `user_id`, `function_name`, `model`, `input_tokens`,
`output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `latency_ms`,
`outcome`, `created_at`. Cost observability, and the counter the daily ceiling
reads. Service role only.

**`app_settings`** — single row: `quality_gate_mode` (`advisory` | `enforcing`,
seeded `advisory`), `strike_threshold`, `strike_window_minutes`, `ban_minutes`,
`daily_call_ceiling`, `min_description_words`, `dupe_radius_meters`,
`dupe_window_minutes`, `cluster_confirm_count`. Readable by authenticated,
writable by service role.

**`report_flags`** — `id`, `report_id`, `flagger_id`, `reason`, `created_at`,
unique on `(report_id, flagger_id)`. Recorded now, unused by any UI in this spec.

### 4.2 Why tunables live in a table

The brief's numbers (3 strikes, 15 minutes, 30-minute ban) are guesses that will
be wrong on contact with real users. In a table, changing them is an UPDATE. As
function secrets, every adjustment is a redeploy — and the database trigger
cannot read them at all, so the gate and the function would drift out of sync.
The enforcement flag lives here too, which is what makes the rollout a one-row
switch.

### 4.3 Security notes

- The gate trigger must be **`SECURITY DEFINER`** — it runs as the inserting
  user but reads and marks `report_quality_tokens`, a table that user has no
  access to by design. Its `search_path` is pinned; a definer function with a
  mutable search_path is a privilege-escalation vector.
- **RLS is enabled on every new table at creation.** Tokens and usage log get no
  client policy whatsoever. `report_quality_tokens` is the only thing standing
  between a client and a forged pass.

---

## 5. The Claude call

`claude-haiku-4-5`, one request, no streaming, no tools.

```ts
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
  timeout: 8_000,   // ms — SDK default is 10 minutes; unusable in front of a submit button
  maxRetries: 1,
});

const res = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 1500,
  temperature: 0,           // permitted on Haiku 4.5; steadier classification
  system: RUBRIC,           // category-specific criteria, stable text
  messages: [{ role: "user", content: reportPayload }],
  output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
});
```

### 5.1 Model-specific constraints

These are properties of Haiku 4.5 specifically and constrain the design:

- **`output_config.effort` is not supported and errors.** Do not add it.
- **Omitting `thinking` means no thinking**, which is what we want — we pay for
  the JSON and nothing else. (Haiku 4.5 predates adaptive thinking; it would use
  the older `budget_tokens` form if thinking were wanted. It is not.)
- **The minimum cacheable prefix is 4096 tokens.** The rubric is far shorter, so
  prompt caching will silently not engage — no error, just
  `cache_creation_input_tokens: 0`. Padding the prompt to 4K to force it would
  cost more than it saves. Do not add `cache_control` and assume it works.
- Sampling parameters *are* permitted (unlike Opus 4.7+), so `temperature: 0`
  is available.
- Structured outputs are supported.

### 5.2 Response schema

```jsonc
{
  "verdict":  "pass" | "needs_detail",
  "missing":  ["location" | "time" | "description" | "evidence" | "suspect" | "direction"],
  "feedback": "Which direction did they head, and roughly what time?",
  "priority": "critical" | "high" | "medium" | "low",
  "priority_reason": "weapon mentioned, ongoing"
}
```

Schema-enforced rather than prompt-begged, which removes the entire class of
"the model wrapped its JSON in prose" failures. Two caveats: every object needs
`additionalProperties: false`, and length constraints are not supported by
structured outputs — so `feedback` gets a length instruction in the prompt and a
hard truncate server-side.

### 5.3 Failure taxonomy

| Situation | Claude called | Token minted | Strike | `quality_status` |
|---|---|---|---|---|
| Pre-filter: under `min_description_words`, or no category | no | no | **yes** | `failed_prefilter` |
| `verdict: pass` | yes | yes | no | `passed` |
| `verdict: needs_detail` | yes | no | **yes** | `failed` |
| API error, timeout, refusal, unparseable | yes | **yes** | no | `skipped_ai_unavailable` |
| Over daily ceiling | no | **yes** | no | `skipped_quota` |
| Banned (≥ threshold strikes in window) | no | no | no | — (HTTP 429) |

The deterministic pre-filter earns a strike because a two-word report is a
genuine quality failure — and it is the most common one. The cheapest call is
the one never made.

Fail-open rows mint a token but record a distinct `quality_status`, so a
fail-open is never indistinguishable from a real pass in the data.

Worst-case latency is bounded at roughly 16 seconds (8s timeout × 2 attempts)
before fail-open returns.

### 5.4 Cost

Estimated ~1,200 input and ~250 output tokens per check, uncached, at Haiku
4.5's $1 / $5 per Mtok: **on the order of 0.25 US cents per report checked**,
~$25/month at 10,000 reports. This is an order-of-magnitude estimate, not a
quote — `ai_usage_log` replaces it with the real number within a day of going
live.

---

## 6. Client contract

The check runs on **text only, before the Cloudinary upload** — a rejected
report should not cost the user a video upload first.

```
tap Submit → checkReportQuality(text)  ──needs_detail──▶  show feedback, stay on form
                    │
                   pass (+token)
                    ▼
             upload media to Cloudinary
                    ▼
             INSERT reports (… quality_token, last_seen_at, police_reference)
```

### 6.1 HTTP

```http
POST /functions/v1/check-report-quality
Authorization: Bearer <supabase session token>

{ "category": "theft", "description": "...", "address": "Allen Avenue, Ikeja",
  "latitude": 6.60, "longitude": 3.35, "has_media": true,
  "last_seen_at": null, "police_reference": null }
```

JWT verification stays **on** — the function writes strikes against the caller's
account and binds tokens to their user id. Deploy without `--no-verify-jwt`.

`has_media` is a boolean, not the files; nothing is uploaded yet and the model
does not need to see the photo. The photo requirement is enforced by the
database against `media_paths` after upload.

Responses — all HTTP 200 except the ban. A verdict is not an error, and a non-2xx
makes `functions.invoke` throw, which would tangle the client's fail-open path.

```jsonc
// pass — also the shape returned on fail-open, distinguished by quality_status
{ "status": "pass", "token": "…", "expires_at": "…",
  "priority": "high", "quality_status": "passed" }

// needs_detail
{ "status": "needs_detail", "missing": ["time", "direction"],
  "feedback": "Which direction did they head, and roughly what time?",
  "strikes": { "count": 2, "threshold": 3 } }

// 429 — banned
{ "status": "paused", "retry_at": "2026-08-12T18:05:00Z", "message": "…" }
```

`strikes.count` is returned deliberately: a user about to be paused should see
it coming rather than hit a wall on the third try.

The function also handles `OPTIONS` with CORS headers — `app.json` declares a
web target and the repo has an `npm run web` script, so a browser caller is
possible.

### 6.2 Client surface

New file `src/lib/reportQuality.ts`:

```ts
export type QualityVerdict =
  | { status: 'pass'; token: string | null; priority: Priority; degraded: boolean }
  | { status: 'needs_detail'; missing: string[]; feedback: string; strikesLeft: number }
  | { status: 'paused'; retryAt: string };

export async function checkReportQuality(input: QualityInput): Promise<QualityVerdict>;
```

Calls `supabase.functions.invoke('check-report-quality', { body })`, which
attaches the session JWT automatically. **If the invoke itself throws** (phone
offline, cold-start timeout) it returns `{ status: 'pass', token: null, degraded:
true }`. Fail-open has to hold on the client too, or a dropped connection
becomes a wall between someone and filing a report.

### 6.3 Existing files that change

- **`src/hooks/useReport.ts`** — calls the check first; passes `quality_token`,
  `last_seen_at`, `police_reference` into the insert; maps `QUALITY_GATE_*`
  error codes to user-facing reasons. Return type goes from `boolean` to a
  `SubmitResult` union, since "failed" now carries *why* and *what is missing*.
- **`app/(tabs)/report.tsx`** — the one call site of `submitReport`, updated to
  switch on that union and surface `feedback`. Also gains the two missing-person
  form inputs. This is the one place the work spills past "thin wiring". The
  file is ~1,310 lines and its submit handler has not been read closely yet;
  confirm the exact shape during implementation rather than assuming.

---

## 7. Verification and deploy

### 7.1 Before anything ships

```bash
npx tsc --noEmit                    # app code — tsconfig excludes supabase/
npx expo lint
npx --yes deno@2 check supabase/functions/check-report-quality/index.ts
```

The `deno check` is the only static check the Edge Function gets; it does cover
the `npm:@anthropic-ai/sdk` import. **None of them cover the SQL** — no Docker
means no local Supabase stack, and the repo has no test framework.

Therefore: **rehearse the migrations on a throwaway free-tier Supabase project
first**, run the §7.4 queries there, then push to production. It is the only way
to find a trigger typo before it is attached to the table real users insert into.

### 7.2 Deploy order

Each step is safe to stop at. Steps 1–4 change nothing a user can see: in
advisory mode the gate records its verdict and gets out of the way.

```bash
# 0. supabase/config.toml is absent even though .temp/ shows the project linked
#    (ref ujbknxfvatvtwthxtytu, Postgres 17.6). `supabase init` may be required
#    before db push will run. Verify first.

npx supabase db push                                    # 1. migrations, advisory by default
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-…     # 2. key — never .env
npx supabase functions deploy check-report-quality      # 3. JWT verification ON

# 4. Smoke-test with a real user JWT: a pass, a needs_detail, rows in ai_usage_log.
# 5. Ship the app update (EAS preview → production).
# 6. Watch advisory verdicts for a few days.
# 7. update app_settings set quality_gate_mode = 'enforcing';
```

### 7.3 Kill switch

`update app_settings set quality_gate_mode = 'advisory'` restores today's
behaviour instantly — no migration rollback, no function redeploy, no app store
review. That is the entire reason the flag lives in a table.

### 7.4 Post-deploy checks

```sql
-- Would enforcement have blocked anything it should not have?
select quality_status, count(*) from reports
where created_at > now() - interval '7 days' group by 1;

-- Real cost and latency, replacing the §5.4 estimate
select count(*), avg(input_tokens), avg(output_tokens),
       avg(latency_ms), percentile_cont(0.95) within group (order by latency_ms)
from ai_usage_log where created_at > now() - interval '7 days';
```

### 7.5 Acceptance criteria

1. `npx tsc --noEmit` and `npx expo lint` clean.
2. `deno check` clean on the Edge Function.
3. A report passing and a report failing the check, end to end, against the
   deployed function.
4. `ai_usage_log` populated with real token counts.
5. A missing-person report lacking any of the four required fields is rejected
   **by the database with the AI deliberately disabled** — proving the
   deterministic half holds without Claude.
6. SOS still fires for a user carrying three strikes.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Fingerprint normalisation drifts between TS and SQL | Identical normalisation documented in §3.1; acceptance test inserts with a token minted from text differing only in whitespace and casing. |
| Haiku misjudges borderline "vague but genuine" reports | Advisory window surfaces this before anything is blocked. Missing-person enforcement does not depend on the model. Model ID is one env var. |
| Migrations land badly on the live database | Additive only, `if not exists` throughout, rehearsed on a throwaway project, advisory by default. |
| `report.tsx` submit handler is more entangled than expected | Flagged as unread; confirm before estimating that step. |
| The brief says Gemini; we are shipping Claude | Communicate to the backend dev — the architecture split is unaffected, only the provider. |
