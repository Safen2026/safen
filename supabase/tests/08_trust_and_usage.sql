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
