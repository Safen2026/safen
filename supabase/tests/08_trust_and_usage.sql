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

  -- Drive the REAL path: cluster_report() reaching the threshold. The earlier
  -- block hand-sets cluster_id before confirmed_at, so it can never catch the
  -- ordering bug this exercises.
  declare
    v_u1 uuid; v_u2 uuid; v_ra uuid; v_rb uuid; v_c uuid;
    v_cbefore int; v_cafter int; v_old_confirm int;
  begin
    select id into v_u1 from public.profiles limit 1;
    select id into v_u2 from public.profiles where id <> v_u1 limit 1;
    assert v_u2 is not null, 'seed at least two profiles in the rehearsal project';

    select cluster_confirm_count into v_old_confirm from public.app_settings;
    update public.app_settings set cluster_confirm_count = 2;
    select reports_confirmed into v_cbefore from public.profiles where id = v_u2;

    insert into public.reports (user_id, category, description, status, latitude, longitude)
    values (v_u1, 'security', 'tipping test first reporter', 'open', 6.9000, 3.9000)
    returning id into v_ra;

    insert into public.reports (user_id, category, description, status, latitude, longitude)
    values (v_u2, 'security', 'tipping test second reporter', 'open', 6.9001, 3.9000)
    returning id into v_rb;

    select cluster_id into v_c from public.reports where id = v_rb;
    assert v_c is not null, 'the second report did not cluster';
    assert (select confirmed_at from public.incident_clusters where id = v_c) is not null,
      'cluster did not confirm on reaching the threshold';

    assert (select verification_status from public.reports where id = v_rb) = 'confirmed',
      'the report that TIPPED the cluster was left pending';
    assert (select verification_status from public.reports where id = v_ra) = 'confirmed',
      'an earlier report in the cluster was left pending';

    select reports_confirmed into v_cafter from public.profiles where id = v_u2;
    assert v_cafter = v_cbefore + 1, 'the tipping reporter was not credited';

    -- A report joining an ALREADY confirmed cluster must inherit confirmation.
    -- record_cluster_confirmation fires only on the null -> not null edge, so
    -- without the late-joiner block in cluster_report() this stays 'pending'.
    declare v_u3 uuid; v_rc uuid; v_c3before int; v_c3after int;
    begin
      select id into v_u3 from public.profiles
       where id not in (v_u1, v_u2) limit 1;
      if v_u3 is not null then
        select reports_confirmed into v_c3before from public.profiles where id = v_u3;
        insert into public.reports (user_id, category, description, status, latitude, longitude)
        values (v_u3, 'security', 'late joiner to confirmed cluster', 'open', 6.9002, 3.9000)
        returning id into v_rc;
        assert (select verification_status from public.reports where id = v_rc) = 'confirmed',
          'a report joining a confirmed cluster was left pending';
        select reports_confirmed into v_c3after from public.profiles where id = v_u3;
        assert v_c3after = v_c3before + 1, 'the late joiner was not credited';
        delete from public.reports where id = v_rc;
      end if;
    end;

    delete from public.reports where id in (v_ra, v_rb);
    delete from public.incident_clusters where id = v_c;
    update public.app_settings set cluster_confirm_count = v_old_confirm;
  end;
end $$;
