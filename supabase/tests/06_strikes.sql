do $$
declare
  v_user uuid; v_count int; v_until timestamptz;
begin
  select id into v_user from public.profiles limit 1;
  delete from public.report_strikes where user_id = v_user;

  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 0,        'fresh user should have no strikes';
  assert v_until is null,    'fresh user should not be banned';

  perform public.record_strike(v_user, 'needs_detail');
  perform public.record_strike(v_user, 'needs_detail');
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 2,     format('expected 2 strikes, got %s', v_count);
  assert v_until is null, 'two strikes must not trigger a ban';

  perform public.record_strike(v_user, 'failed_prefilter');
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 3,         format('expected 3 strikes, got %s', v_count);
  assert v_until > now(),     'three strikes inside the window must ban';

  -- Strikes older than the window do not count.
  update public.report_strikes set created_at = now() - interval '48 hours'
   where user_id = v_user;
  select strike_count, banned_until into v_count, v_until from public.strike_state(v_user);
  assert v_count = 0,     'expired strikes must not count';
  assert v_until is null, 'ban must lapse once strikes age out';

  delete from public.report_strikes where user_id = v_user;
end $$;
