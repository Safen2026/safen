-- PANIC BUTTON. Run this if report submission breaks after applying the AI
-- pipeline migrations. Paste into the Supabase SQL editor.
--
-- Dropping the three INSERT triggers restores exactly the pre-migration write
-- path for public.reports. It destroys NO data: every added column keeps its
-- values, every new table is left intact, and existing rows are untouched.
-- Re-create the triggers later by re-running the relevant migration files.
--
-- Prefer the softer switch first — it needs no DDL and covers the AI gate:
--
--     update public.app_settings set quality_gate_mode = 'advisory';
--
-- Use the drops below only if inserts are failing even in advisory mode, which
-- would mean the trigger itself is raising rather than recording.

-- 1. The quality gate (BEFORE INSERT). This is the one that can block a report.
drop trigger if exists trg_report_quality_gate on public.reports;

-- 2. Duplicate clustering (AFTER INSERT). Cannot block the row itself, but an
--    error inside it rolls back the whole transaction.
drop trigger if exists trg_cluster_report on public.reports;

-- 3. Trust-signal counter (AFTER INSERT). Same rollback risk.
drop trigger if exists trg_record_report_submitted on public.reports;

-- Verify nothing is left on reports:
--   select tgname from pg_trigger
--    where tgrelid = 'public.reports'::regclass and not tgisinternal;

-- Sanity-check that a plain insert works again (adjust the user id):
--   insert into public.reports (user_id, category, description, status)
--   values ((select id from public.profiles limit 1), 'security', 'rollback check', 'open')
--   returning id;
--   -- then: delete from public.reports where description = 'rollback check';
