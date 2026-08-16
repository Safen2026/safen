do $$
declare
  v_mode text;
  v_count int;
begin
  select quality_gate_mode into v_mode from public.app_settings;
  assert v_mode = 'advisory', 'app_settings must seed as advisory';

  select count(*) into v_count from public.app_settings;
  assert v_count = 1, 'app_settings must hold exactly one row';

  -- The single-row guard must reject a second row.
  begin
    insert into public.app_settings (id) values (false);
    assert false, 'app_settings accepted a second row';
  exception when others then null;
  end;

  assert (select relrowsecurity from pg_class where oid = 'public.report_quality_tokens'::regclass),
    'RLS is not enabled on report_quality_tokens';

  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'report_quality_tokens';
  assert v_count = 0, 'report_quality_tokens must have no client-facing policy';
end $$;
