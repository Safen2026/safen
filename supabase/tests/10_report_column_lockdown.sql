-- DATABASE_SCHEMA.md flagged verification_status, cluster_id and triage_reason
-- as client-writable through PostgREST. RLS does not help here: privileges are
-- checked BEFORE row policies, so a role holding a table-level INSERT/UPDATE
-- grant may supply ANY column, and PostgREST forwards whatever the client sent.
-- The gate, triage and cluster triggers assign these columns themselves —
-- trigger assignments are not privilege-checked, so locking the roles out does
-- not disturb them.
do $$
begin
  -- ---------------------------------------------------------------- UPDATE --
  -- Nothing in app/ or src/ updates a report after insert; the three call sites
  -- are one insert and two selects. So the whole verb goes, not a column list:
  -- a column-level REVOKE is a silent no-op while the table-level grant stands.
  assert not has_any_column_privilege('authenticated', 'public.reports', 'UPDATE'),
    'authenticated can still UPDATE public.reports — verification_status is forgeable';
  assert not has_any_column_privilege('anon', 'public.reports', 'UPDATE'),
    'anon can still UPDATE public.reports';

  -- ---------------------------------------------------------------- INSERT --
  -- The three columns the schema doc named.
  assert not has_column_privilege('authenticated', 'public.reports', 'verification_status', 'INSERT'),
    'authenticated can still INSERT verification_status — a user could self-verify a report';
  assert not has_column_privilege('authenticated', 'public.reports', 'cluster_id', 'INSERT'),
    'authenticated can still INSERT cluster_id — a user could attach a report to any cluster';
  assert not has_column_privilege('authenticated', 'public.reports', 'triage_reason', 'INSERT'),
    'authenticated can still INSERT triage_reason';

  -- The AI-owned columns beside them. Same argument: the BEFORE INSERT gate
  -- sets them, so a client that supplies them is either confused or lying.
  assert not has_column_privilege('authenticated', 'public.reports', 'priority', 'INSERT'),
    'authenticated can still INSERT priority — a user could self-assign critical';
  assert not has_column_privilege('authenticated', 'public.reports', 'priority_rank', 'INSERT'),
    'authenticated can still INSERT priority_rank';
  assert not has_column_privilege('authenticated', 'public.reports', 'quality_status', 'INSERT'),
    'authenticated can still INSERT quality_status — a user could claim a pass';
  assert not has_column_privilege('authenticated', 'public.reports', 'quality_checked_at', 'INSERT'),
    'authenticated can still INSERT quality_checked_at';
  assert not has_column_privilege('authenticated', 'public.reports', 'gate_reason', 'INSERT'),
    'authenticated can still INSERT gate_reason';

  assert not has_any_column_privilege('anon', 'public.reports', 'INSERT'),
    'anon can still INSERT into public.reports — reporting requires a session';

  -- ------------------------------------------------- and the report still works --
  -- Over-revoking breaks submission silently, so pin every column useReport.ts
  -- actually sends. If the form grows a field, this list grows with it.
  assert has_column_privilege('authenticated', 'public.reports', 'user_id', 'INSERT'),
    'reports can no longer be submitted: user_id lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'category', 'INSERT'),
    'reports can no longer be submitted: category lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'description', 'INSERT'),
    'reports can no longer be submitted: description lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'address', 'INSERT'),
    'reports can no longer be submitted: address lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'is_anonymous', 'INSERT'),
    'reports can no longer be submitted: is_anonymous lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'latitude', 'INSERT'),
    'reports can no longer be submitted: latitude lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'longitude', 'INSERT'),
    'reports can no longer be submitted: longitude lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'media_paths', 'INSERT'),
    'reports can no longer be submitted: media_paths lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'status', 'INSERT'),
    'reports can no longer be submitted: status lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'quality_token', 'INSERT'),
    'reports can no longer be submitted: quality_token lost its INSERT grant — the gate would reject every insert';
  assert has_column_privilege('authenticated', 'public.reports', 'last_seen_at', 'INSERT'),
    'missing-person reports can no longer be submitted: last_seen_at lost its INSERT grant';
  assert has_column_privilege('authenticated', 'public.reports', 'police_reference', 'INSERT'),
    'missing-person reports can no longer be submitted: police_reference lost its INSERT grant';

  -- Reading is untouched: history.tsx and the notification modal both select.
  assert has_table_privilege('authenticated', 'public.reports', 'SELECT'),
    'authenticated lost SELECT on reports — history and notification details would break';

  -- The Edge Function writes every locked column through the service role.
  assert has_column_privilege('service_role', 'public.reports', 'verification_status', 'UPDATE'),
    'service_role lost UPDATE on verification_status — the pipeline cannot write its own results';
  assert has_column_privilege('service_role', 'public.reports', 'priority', 'INSERT'),
    'service_role lost INSERT on priority';
end $$;
