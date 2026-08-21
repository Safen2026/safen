# Database Schema Documentation

> **Base tables** (§1) were introspected from Supabase on 2026-08-12.
> **AI pipeline additions** (§2–§5) are derived from the migrations in
> `supabase/migrations/`, applied to production on 2026-08-14. They have not
> been re-introspected — regenerate authoritatively with the query in §6 if you
> need certainty.
>
> Last updated: 2026-08-15

## Overview

**14 tables.** Eight pre-date the AI report pipeline; six were added by it.

| | Tables |
|---|---|
| Base | `alerts`, `emergency_contacts`, `feedback`, `locations`, `medical_profiles`, `notifications`, `profiles`, `reports` |
| AI pipeline | `app_settings`, `report_quality_tokens`, `report_strikes`, `incident_clusters`, `report_flags`, `ai_usage_log` |

`profiles` is the hub — nearly every other table has a foreign key back to it.
`profiles.id` is assumed to reference `auth.users.id` (the standard Supabase
pattern); this is still unconfirmed, and the rehearsal seed handles both cases.

---

# 1. Base tables

## profiles

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | — | PK. Assumed to reference `auth.users.id` |
| full_name | text | YES | — | |
| phone | text | YES | — | Used for emergency-contact matching, **not** for sign-in |
| email | text | YES | — | |
| is_at_home | boolean | YES | `true` | |
| auto_notify | boolean | YES | `true` | |
| created_at | timestamptz | YES | `now()` | |
| avatar_url | text | YES | — | |
| expo_push_token | text | YES | — | |
| push_enabled | boolean | YES | `true` | |
| medical_reminder_sent_at | timestamptz | YES | — | |
| **trust_score** | integer | NO | `50` | Recorded only — **nothing writes to it** |
| **reports_submitted** | integer | NO | `0` | `trg_record_report_submitted` |
| **reports_confirmed** | integer | NO | `0` | `record_cluster_confirmation` / `cluster_report` |
| **reports_flagged_fake** | integer | NO | `0` | Reserved; no writer yet |

> Sign-in resolves against `auth.users.phone`, not `profiles.phone`.

## reports

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` | PK |
| user_id | uuid | YES | — | FK → `profiles.id`. Nullable: anonymous reports |
| category | text | NO | — | `medical` \| `fire` \| `security` \| `missing_person` |
| description | text | YES | — | |
| latitude / longitude | double precision | YES | — | |
| status | text | NO | `'open'` | |
| created_at | timestamptz | YES | `now()` | |
| media_paths | text[] | YES | — | Cloudinary URLs |
| address | text | YES | — | |
| is_anonymous | boolean | NO | `false` | |
| **quality_token** | text | YES | — | Transient. Blanked by the gate — **always null at rest** |
| **quality_checked_at** | timestamptz | YES | — | Stamped only on a pass |
| **quality_status** | text | YES | — | `passed` \| `advisory_failed` \| `skipped_ai_unavailable` \| `skipped_quota` |
| **gate_reason** | text | YES | — | Why the gate *would* have rejected, in advisory mode |
| **priority** | report_priority | YES | — | AI-assigned; `medium` on the failure path |
| **priority_rank** | smallint | YES | — | critical=4, high=3, medium=2, low=1 |
| **triage_reason** | text | YES | — | Set when a token carried no AI priority |
| **last_seen_at** | timestamptz | YES | — | Missing-person: required |
| **police_reference** | text | YES | — | Missing-person: required |
| **cluster_id** | uuid | YES | — | FK → `incident_clusters.id` |
| **verification_status** | text | NO | `'pending'` | `pending` \| `confirmed` \| `rejected` |

**Triggers:** `trg_report_quality_gate` (BEFORE INSERT), `trg_cluster_report`
(AFTER INSERT), `trg_record_report_submitted` (AFTER INSERT).

## alerts

SOS and emergency alerts. **Deliberately untouched by the AI pipeline** — no
trigger, no gate, no strike. A user mid-ban can still fire an SOS.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| user_id | uuid | NO | FK → `profiles.id` |
| type | text | NO | — |
| status | text | NO | `'active'` |
| latitude / longitude | double precision | YES | — |
| created_at | timestamptz | YES | `now()` |
| resolved_at | timestamptz | YES | — |
| description | text | YES | — |
| media_paths | ARRAY | YES | — |

## locations

Per-alert GPS breadcrumbs. **No client code reads or writes this table.**

| id | uuid | NO | `gen_random_uuid()` |
|---|---|---|---|
| alert_id | uuid | NO | FK → `alerts.id` |
| latitude / longitude | double precision | NO | — |
| recorded_at | timestamptz | YES | `now()` |

## emergency_contacts

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` | |
| user_id | uuid | NO | — | FK → `profiles.id` (owner) |
| name / phone | text | NO | — | |
| relationship | text | YES | — | |
| created_at | timestamptz | YES | `now()` | |
| is_on_app | boolean | YES | `false` | |
| contact_user_id | uuid | YES | — | FK → `profiles.id` if they use Safen |
| status | text | YES | `'accepted'` | |

## notifications

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` | |
| recipient_id / sender_id | uuid | NO | — | FK → `profiles.id` |
| sender_name | text | YES | — | Denormalised copy |
| type / title / body | text | NO | — | |
| latitude / longitude | double precision | YES | — | |
| alert_id | uuid | YES | — | FK → `alerts.id` |
| report_id | uuid | YES | — | FK → `reports.id` |
| is_read | boolean | NO | `false` | |
| created_at | timestamptz | NO | `now()` | |

> `type` has a CHECK constraint predating journey tracking; journey
> notifications insert `type = 'report'` as a workaround (see
> `src/lib/notifications.ts`).

## medical_profiles

`id`, `user_id` (FK → profiles), `blood_type`, `height_cm`, `weight_kg`,
`is_organ_donor`, `allergies` (**jsonb**, `[]`), `conditions` (text[], `{}`),
`medications` (text[], `{}`), `doctor_name`, `doctor_phone`, `doctor_hospital`,
`created_at`, `updated_at`.

## feedback

`id`, `user_id` (FK → profiles), `message`, `created_at`.

---

# 2. AI pipeline tables

## app_settings — singleton tunables

One row, enforced by `id boolean primary key default true` +
`check (id)`. **This is the kill switch.**

| Column | Type | Default |
|---|---|---|
| id | boolean | `true` (PK, singleton) |
| **quality_gate_mode** | text | `'advisory'` — `advisory` \| `enforcing` |
| strike_threshold | integer | `3` |
| strike_window_minutes | integer | `15` |
| ban_minutes | integer | `30` |
| daily_call_ceiling | integer | `40` |
| min_description_words | integer | `15` |
| dupe_radius_meters | integer | `500` |
| dupe_window_minutes | integer | `60` |
| cluster_confirm_count | integer | `5` |
| updated_at | timestamptz | `now()` |

RLS: readable by `authenticated`, writable by service role only.

```sql
-- kill switch
update public.app_settings set quality_gate_mode = 'advisory';
```

## report_quality_tokens

Single-use tokens minted by the Edge Function. **RLS enabled with no policy at
all** — service role only. This table is what stands between a client and a
forged quality pass.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → `profiles.id` |
| token_sha256 | text | UNIQUE. Only the hash is stored, never the token |
| payload_fingerprint | text | sha256 of normalised `category` + `description` |
| verdict | text | `passed` \| `skipped_ai_unavailable` \| `skipped_quota` |
| priority | text | nullable; null on fail-open |
| expires_at | timestamptz | 15 minutes after minting |
| used_at | timestamptz | Set once consumed |
| created_at | timestamptz | |

## report_strikes

One row per failed quality check. **Ban state is derived, never stored** — no
expiry job, nothing to get stuck.

`id`, `user_id` (FK → profiles), `reason`, `created_at`.
RLS: a user may read only their own rows.

## incident_clusters

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| category | text | |
| centroid_lat / centroid_lng | double precision | Running average |
| report_count | integer | |
| distinct_reporter_count | integer | |
| first_reported_at / last_reported_at | timestamptz | |
| confirmed_at | timestamptz | Set at `cluster_confirm_count` distinct reporters |

RLS: readable by `authenticated`.

## ai_usage_log

Cost observability, and the counter behind the daily ceiling. **RLS enabled
with no policy** — service role only.

`id`, `user_id`, `function_name`, `model`, `input_tokens`, `output_tokens`,
`cache_read_tokens`, `cache_creation_tokens`, `latency_ms`, `outcome`,
`created_at`.

`outcome` values seen in practice: `passed`, `needs_detail`, `failed_prefilter`,
`skipped_quota`, `degraded:<error>`.

## report_flags

`id`, `report_id`, `flagger_id`, `reason`, `created_at`, unique
`(report_id, flagger_id)`. Recorded for future trust scoring; **no UI writes to
it yet.** RLS: authenticated may insert only their own.

---

# 3. Types, functions and triggers

**Enum** `public.report_priority`: `low` | `medium` | `high` | `critical`

| Function | Purpose |
|---|---|
| `sha256_hex(text)` | Hex SHA-256 via `extensions.digest` |
| `report_payload_fingerprint(text, text)` | **Must stay byte-identical to `fingerprint.ts`** |
| `current_settings()` | Returns the `app_settings` singleton |
| `enforce_report_quality_gate()` | BEFORE INSERT gate. `SECURITY DEFINER` |
| `missing_person_gap(reports)` | The four missing-person requirements |
| `record_strike(uuid, text)` / `strike_state(uuid)` | Strikes and derived ban |
| `haversine_meters(…)` | Great-circle distance, no PostGIS |
| `cluster_report()` | AFTER INSERT duplicate clustering |
| `ai_calls_today(uuid)` | Daily-ceiling counter |
| `record_report_submitted()` / `record_cluster_confirmation()` | Trust signals |

**EXECUTE revoked** from `public, anon, authenticated` on `record_strike`,
`strike_state`, `ai_calls_today`, `report_payload_fingerprint`, `sha256_hex`,
`current_settings` (migration `20260812120900`). Without this, any authenticated
user could ban any other via PostgREST RPC.

---

# 4. Relationships

```
profiles
 ├── alerts.user_id ──── locations.alert_id
 │                  └── notifications.alert_id
 ├── reports.user_id ─── notifications.report_id
 │                  ├── reports.cluster_id → incident_clusters
 │                  └── report_flags.report_id
 ├── emergency_contacts.user_id / .contact_user_id
 ├── medical_profiles.user_id
 ├── feedback.user_id
 ├── report_quality_tokens.user_id
 ├── report_strikes.user_id
 ├── report_flags.flagger_id
 ├── ai_usage_log.user_id
 └── notifications.recipient_id / .sender_id
```

---

# 5. Open questions

- Does `profiles.id` actually have a FK to `auth.users.id`? Still unconfirmed.
- ~~`verification_status`, `cluster_id` and `triage_reason` are client-writable
  via PostgREST.~~ **Closed** by `20260812121000_lock_down_report_columns.sql`:
  `anon`/`authenticated` lost table-level INSERT and UPDATE on `reports`, and
  INSERT came back as a 12-column grant covering only what the report form
  sends. Every other column is server-owned. Note a column-level `REVOKE` alone
  would *not* have worked — it is accepted silently and does nothing while the
  table-level grant stands. Guarded by `supabase/tests/10_report_column_lockdown.sql`.
- `ai_calls_today` uses `date_trunc('day', now())` in the session timezone (UTC
  on Supabase), so the daily ceiling resets at 01:00 WAT, not local midnight.
- `reports_confirmed` counts confirmed-cluster *participations*, not reports.

---

# 6. Regenerating this document

```sql
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, ordinal_position;

select conrelid::regclass as child, conname,
       confrelid::regclass as parent
  from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
 order by 1;

select tgrelid::regclass as table_name, tgname
  from pg_trigger where not tgisinternal
   and tgrelid::regclass::text like 'public.%';
```
