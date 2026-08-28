-- Assertions for the Nigerian gazetteer.
do $$
declare n integer;
begin
  select count(*) into n from public.ng_states;
  if n <> 37 then raise exception '36 states + FCT expected, found %', n; end if;

  select count(*) into n from public.ng_lgas;
  if n <> 774 then raise exception '774 LGAs expected, found %', n; end if;

  -- Published per-state figures; a mangled import would move these.
  select count(*) into n from public.ng_lgas where state_code = 'FC';
  if n <> 6  then raise exception 'FCT should have 6 area councils, found %', n; end if;
  select count(*) into n from public.ng_lgas where state_code = 'LA';
  if n <> 20 then raise exception 'Lagos should have 20 LGAs, found %', n; end if;
  select count(*) into n from public.ng_lgas where state_code = 'KN';
  if n <> 44 then raise exception 'Kano should have 44 LGAs, found %', n; end if;

  -- Every LGA belongs to a real state.
  select count(*) into n
  from public.ng_lgas l left join public.ng_states s on s.code = l.state_code
  where s.code is null;
  if n > 0 then raise exception '% LGAs reference a missing state', n; end if;

  -- Codes the resolver and alias seed depend on by name.
  if not exists (select 1 from public.ng_lgas where code = 'LA-ikeja') then
    raise exception 'LA-ikeja missing'; end if;
  if not exists (select 1 from public.ng_lgas where code = 'FC-abuja') then
    raise exception 'FC-abuja missing (the FCT LGA is Abuja, not Municipal)'; end if;

  -- Sabon Gari must stay ambiguous across states.
  select count(*) into n from public.ng_place_aliases where alias_norm = 'sabon gari';
  if n < 2 then raise exception 'sabon gari must remain ambiguous, found % rows', n; end if;

  -- Aliases must resolve to real LGAs.
  select count(*) into n
  from public.ng_place_aliases a left join public.ng_lgas l on l.code = a.lga_code
  where a.lga_code is not null and l.code is null;
  if n > 0 then raise exception '% aliases point at a missing LGA', n; end if;

  -- Gazetteer is read-only to clients (default privileges grant ALL otherwise).
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('ng_states','ng_lgas','ng_place_aliases')
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'gazetteer must be read-only to clients';
  end if;

  -- profiles gained its area columns.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='last_lga_code'
  ) then raise exception 'profiles.last_lga_code missing'; end if;
end $$;
