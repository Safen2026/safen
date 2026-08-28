-- ════════════════════════════════════════════════════════════════════
-- lock_down_report_columns  (closes finding I4)
--
-- public.reports carries GRANT ALL to anon and authenticated. RLS restricts
-- which ROWS a client may touch; it does not restrict which COLUMNS. So a
-- client could insert a report with verification_status already set to
-- 'confirmed', or update its own report to confirmed.
--
-- Nothing read those columns while this was only a latent flaw. The safety
-- feed is about to, so it is closed now: without this, a client could inject
-- fabricated "confirmed" incidents into other users' feeds.
--
-- Approach: revoke table-wide INSERT/UPDATE, then grant INSERT back on exactly
-- the columns a reporter legitimately supplies. Trigger-assigned columns are
-- unaffected — column privileges apply to columns named in the statement, not
-- to NEW.* assignments inside enforce_report_quality_gate() or cluster_report().
--
-- DELETE is intentionally left as-is: this migration is scoped to I4, and
-- changing delete behaviour is a separate decision.
-- ════════════════════════════════════════════════════════════════════

revoke insert, update on public.reports from anon, authenticated;

-- Columns a reporter supplies. Verified against src/hooks/useReport.ts, which
-- inserts exactly: user_id, category, description, address, is_anonymous,
-- latitude, longitude, media_paths, status. The three quality_* / police_*
-- columns are included because the report-quality flow writes them.
grant insert (
  user_id,
  category,
  description,
  address,
  is_anonymous,
  latitude,
  longitude,
  media_paths,
  status,
  quality_token,
  last_seen_at,
  police_reference
) on public.reports to anon, authenticated;

-- No UPDATE grant: no client code path updates a report today (verified by
-- grep across src/ and app/ — only .insert and .select). Restore a narrow
-- column-scoped UPDATE grant if that ever changes; do not re-grant the table.

comment on column public.reports.verification_status is
  'Server-assigned only. Never grant INSERT/UPDATE on this column to clients: the safety feed trusts it.';
