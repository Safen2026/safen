do $$
begin
  assert not has_function_privilege('authenticated', 'public.record_strike(uuid, text)', 'execute'),
    'record_strike is still executable by authenticated — any user could ban any other user';
  assert not has_function_privilege('authenticated', 'public.strike_state(uuid)', 'execute'),
    'strike_state is still executable by authenticated';
  assert not has_function_privilege('authenticated', 'public.ai_calls_today(uuid)', 'execute'),
    'ai_calls_today is still executable by authenticated';
  -- These MUST stay executable: the gate trigger calls them on every insert.
  assert has_function_privilege('postgres', 'public.missing_person_gap(public.reports)', 'execute'),
    'missing_person_gap must remain callable';
end $$;
