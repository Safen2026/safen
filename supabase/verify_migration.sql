-- Post-migration verification. Safe to run against production.
--
-- Read-only except for one report insert that is deleted again, and a
-- profiles.reports_submitted increment that is undone. Does NOT touch
-- quality_gate_mode, unlike the test suite in supabase/tests/ — those flip the
-- gate to 'enforcing' mid-run and must never be pointed at production.
do $$
declare
  v_missing text := '';
  v_user    uuid;
  v_id      uuid;
  v_status  text;
  v_reason  text;
  v_mode    text;
  v_trigs   int;
begin
  -- 1. Every new table present?
  select string_agg(t, ', ') into v_missing from unnest(array[
    'app_settings','report_quality_tokens','report_strikes',
    'incident_clusters','report_flags','ai_usage_log'
  ]) t where to_regclass('public.' || t) is null;
  assert coalesce(v_missing, '') = '', 'missing tables: ' || v_missing;

  -- 2. Every new column on the existing tables present?
  select string_agg(c, ', ') into v_missing from unnest(array[
    'quality_token','quality_checked_at','quality_status','gate_reason',
    'priority','priority_rank','triage_reason',
    'last_seen_at','police_reference','cluster_id','verification_status'
  ]) c where not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='reports' and column_name=c);
  assert coalesce(v_missing, '') = '', 'missing reports columns: ' || v_missing;

  select string_agg(c, ', ') into v_missing from unnest(array[
    'trust_score','reports_submitted','reports_confirmed','reports_flagged_fake'
  ]) c where not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='profiles' and column_name=c);
  assert coalesce(v_missing, '') = '', 'missing profiles columns: ' || v_missing;

  -- 3. The gate must be ADVISORY. If this is 'enforcing', stop and fix it.
  select quality_gate_mode into v_mode from public.app_settings;
  assert v_mode = 'advisory',
    format('quality_gate_mode is %L — expected advisory', v_mode);

  -- 4. Triggers wired on reports, and NONE on alerts (SOS must stay ungated).
  select count(*) into v_trigs from pg_trigger
   where tgrelid = 'public.reports'::regclass and not tgisinternal;
  assert v_trigs = 3, format('expected 3 triggers on reports, found %s', v_trigs);

  select count(*) into v_trigs from pg_trigger
   where tgrelid = 'public.alerts'::regclass and not tgisinternal;
  assert v_trigs = 0, format('SOS REGRESSION: %s trigger(s) on alerts', v_trigs);

  -- 5. RPC lockdown actually took effect.
  assert not has_function_privilege('authenticated','public.record_strike(uuid, text)','execute'),
    'record_strike is still callable by authenticated — any user could ban any other';
  assert not has_function_privilege('authenticated','public.strike_state(uuid)','execute'),
    'strike_state is still callable by authenticated';

  -- 6. An OLD app build (no quality_token) must still be able to file a report.
  --    No coordinates, so the clustering trigger returns early.
  select id into v_user from public.profiles limit 1;
  assert v_user is not null, 'no profiles to test with';

  insert into public.reports (user_id, category, description, status)
  values (v_user, 'security', 'post-migration verification — safe to delete', 'open')
  returning id, quality_status, gate_reason into v_id, v_status, v_reason;

  assert v_status = 'advisory_failed',
    format('expected advisory_failed, got %L', v_status);
  assert v_reason = 'QUALITY_GATE_TOKEN_MISSING',
    format('expected QUALITY_GATE_TOKEN_MISSING, got %L', v_reason);

  -- Undo the test row and the counter it incremented.
  delete from public.reports where id = v_id;
  update public.profiles set reports_submitted = greatest(reports_submitted - 1, 0)
   where id = v_user;

  raise notice 'ALL CHECKS PASSED — gate is advisory, old clients admitted, SOS ungated.';
end $$;
