do $$
declare
  v_user uuid; v_token text := 'tok_tri_' || gen_random_uuid()::text;
  v_id uuid; v_pri public.report_priority; v_rank smallint;
begin
  select id into v_user from public.profiles limit 1;
  update public.app_settings set quality_gate_mode = 'advisory';

  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, priority, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('security', 'armed men on allen avenue now'),
          'passed', 'critical', now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'security', 'armed men on allen avenue now', 'open', v_token)
  returning id, priority, priority_rank into v_id, v_pri, v_rank;

  assert v_pri  = 'critical', format('expected critical, got %s', v_pri);
  assert v_rank = 4,          format('expected rank 4, got %s', v_rank);

  delete from public.reports where id = v_id;

  -- A token minted by a fail-open path carries no priority: default to medium.
  v_token := 'tok_tri2_' || gen_random_uuid()::text;
  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, priority, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('fire', 'smoke somewhere'),
          'skipped_ai_unavailable', null, now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'fire', 'smoke somewhere', 'open', v_token)
  returning id, priority into v_id, v_pri;
  assert v_pri = 'medium', 'fail-open token should default priority to medium';
  assert (select triage_reason from public.reports where id = v_id) = 'ai_unavailable',
    'triage_reason not recorded for fail-open';
  delete from public.reports where id = v_id;
end $$;
