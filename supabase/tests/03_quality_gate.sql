do $$
declare
  v_user uuid;
  v_token text := 'tok_test_' || gen_random_uuid()::text;
  v_token2 text;
  v_id uuid;
  v_status text;
  v_reason text;
begin
  select id into v_user from public.profiles limit 1;
  assert v_user is not null, 'seed at least one profile in the rehearsal project';

  update public.app_settings set quality_gate_mode = 'advisory';

  -- Advisory: a report with no token is admitted, and the reason is recorded.
  insert into public.reports (user_id, category, description, status)
  values (v_user, 'security', 'no token at all', 'open')
  returning id, quality_status, gate_reason into v_id, v_status, v_reason;
  assert v_reason = 'QUALITY_GATE_TOKEN_MISSING', 'advisory did not record the missing token';
  delete from public.reports where id = v_id;

  -- A valid token passes, is consumed, and the column is blanked.
  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, expires_at)
  values (v_user, public.sha256_hex(v_token),
          public.report_payload_fingerprint('security', 'a real description here'),
          'passed', now() + interval '15 minutes');

  insert into public.reports (user_id, category, description, status, quality_token)
  values (v_user, 'security', 'a real description here', 'open', v_token)
  returning id, quality_status, gate_reason into v_id, v_status, v_reason;

  assert v_status = 'passed',        format('expected passed, got %s', v_status);
  assert v_reason is null,           'gate_reason should be null on a pass';
  assert (select quality_token from public.reports where id = v_id) is null,
    'quality_token was not blanked';
  assert (select used_at from public.report_quality_tokens
           where token_sha256 = public.sha256_hex(v_token)) is not null,
    'token was not marked used';
  delete from public.reports where id = v_id;

  -- Enforcing: an already-spent token is rejected as USED.
  update public.app_settings set quality_gate_mode = 'enforcing';
  begin
    insert into public.reports (user_id, category, description, status, quality_token)
    values (v_user, 'security', 'a real description here', 'open', v_token);
    assert false, 'enforcing mode admitted an already-used token';
  exception when others then
    assert sqlerrm like '%QUALITY_GATE_TOKEN_USED%',
      format('expected TOKEN_USED, got: %s', sqlerrm);
  end;

  -- Enforcing: a FRESH token whose text changed after approval is rejected
  -- as PAYLOAD_MISMATCH. This needs its own unspent token: reusing the one
  -- above short-circuits on TOKEN_USED and never reaches the fingerprint
  -- comparison, which would leave that branch entirely untested.
  v_token2 := 'tok_test_' || gen_random_uuid()::text;
  insert into public.report_quality_tokens
    (user_id, token_sha256, payload_fingerprint, verdict, expires_at)
  values (v_user, public.sha256_hex(v_token2),
          public.report_payload_fingerprint('security', 'the approved text'),
          'passed', now() + interval '15 minutes');
  begin
    insert into public.reports (user_id, category, description, status, quality_token)
    values (v_user, 'security', 'COMPLETELY different text', 'open', v_token2);
    assert false, 'enforcing mode admitted a payload mismatch';
  exception when others then
    assert sqlerrm like '%QUALITY_GATE_PAYLOAD_MISMATCH%',
      format('expected PAYLOAD_MISMATCH, got: %s', sqlerrm);
  end;
  delete from public.report_quality_tokens
   where token_sha256 = public.sha256_hex(v_token2);

  update public.app_settings set quality_gate_mode = 'advisory';
  delete from public.report_quality_tokens where token_sha256 = public.sha256_hex(v_token);
end $$;
