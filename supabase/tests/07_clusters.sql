do $$
declare
  v_a uuid; v_b uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_distinct int;
begin
  select id into v_a from public.profiles limit 1;
  select id into v_b from public.profiles where id <> v_a limit 1;
  assert v_b is not null, 'seed at least two profiles in the rehearsal project';

  update public.app_settings set quality_gate_mode = 'advisory';

  -- ~110m apart: same incident.
  assert public.haversine_meters(6.6000, 3.3500, 6.6010, 3.3500) between 100 and 120,
    'haversine is miscalibrated';

  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_a, 'security', 'robbery at the junction', 'open', 6.6000, 3.3500)
  returning id into v_r1;

  select cluster_id into v_c1 from public.reports where id = v_r1;

  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_b, 'security', 'men robbing people near junction', 'open', 6.6010, 3.3500)
  returning id into v_r2;

  select cluster_id into v_c2 from public.reports where id = v_r2;

  assert v_c1 is not null and v_c1 = v_c2, 'nearby same-category reports did not cluster';

  select distinct_reporter_count into v_distinct
    from public.incident_clusters where id = v_c1;
  assert v_distinct = 2, format('expected 2 distinct reporters, got %s', v_distinct);

  -- ~11km away: different incident.
  insert into public.reports (user_id, category, description, status, latitude, longitude)
  values (v_a, 'security', 'unrelated robbery far away', 'open', 6.7000, 3.3500)
  returning id into v_r3;

  select cluster_id into v_c3 from public.reports where id = v_r3;

  assert v_c3 is distinct from v_c1, 'a distant report was wrongly clustered';

  delete from public.reports where id in (v_r1, v_r2, v_r3);
  delete from public.incident_clusters where id in (v_c1, v_c3);
end $$;
