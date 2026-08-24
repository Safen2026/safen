-- DATABASE_SCHEMA.md listed verification_status, cluster_id and triage_reason as
-- client-writable through PostgREST. They are, and so is every other column on
-- the table: Supabase grants the API roles table-level ALL on schema public, and
-- a table-level grant lets a role supply EVERY column. RLS does not close this —
-- privileges are checked before row policies ever run, so a policy that permits
-- the row still permits whatever columns the client put in it.
--
-- The trap worth naming, because the obvious fix silently does nothing:
--
--     revoke update (verification_status) on public.reports from authenticated;
--
-- is accepted without error, without warning, and leaves the privilege in place,
-- because column privileges are additive to the table privilege rather than
-- subtractive from it. The table-level verb has to be revoked first; the
-- legitimate columns then come back one by one.
--
-- The gate, triage and cluster triggers keep writing every locked column —
-- trigger assignments to NEW are not privilege-checked. service_role is
-- deliberately untouched, so the Edge Function retains full access.
--
-- NOTE: a later `grant all on all tables in schema public to authenticated`
-- (a common Supabase bootstrap snippet) would undo all of this. Test 10 exists
-- to catch that.

-- ---------------------------------------------------------------- UPDATE ----
-- Nothing in app/ or src/ updates a report after insert: the three call sites
-- are one insert (useReport) and two selects (history, the notification modal).
-- So the whole verb goes rather than a column list.
revoke update on public.reports from anon, authenticated;

-- ---------------------------------------------------------------- INSERT ----
-- Replace the blanket grant with exactly the columns the report form sends.
-- Everything absent below is server-owned from here on: verification_status,
-- cluster_id, triage_reason, priority, priority_rank, quality_status,
-- quality_checked_at, gate_reason, plus id/created_at/type/title.
--
-- anon gets nothing: submitting a report requires a Supabase session, and an
-- "anonymous" report is an authenticated insert carrying is_anonymous = true.
revoke insert on public.reports from anon, authenticated;
grant insert (
  user_id, category, description, address, is_anonymous,
  latitude, longitude, media_paths, status,
  quality_token, last_seen_at, police_reference
) on public.reports to authenticated;

-- SELECT is deliberately left alone — history.tsx and NotificationDetailsModal
-- both read reports, and RLS already scopes which rows they see.
