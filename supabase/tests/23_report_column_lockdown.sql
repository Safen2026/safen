-- Finding I4: reports carries GRANT ALL to clients, and RLS restricts rows but
-- never columns. These assertions prove a client cannot self-confirm a report.
begin;

-- 1. The privilege is actually gone from the catalogue.
do $$
declare leaked text;
begin
  select string_agg(distinct grantee || ':' || column_name, ', ')
    into leaked
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'reports'
    and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE')
    and column_name in ('verification_status','cluster_id','triage_reason',
                        'quality_status','priority','priority_rank','gate_reason');
  if leaked is not null then
    raise exception 'server-assigned columns still client-writable: %', leaked;
  end if;
end $$;

-- 2. A forged verification_status is refused at the privilege layer.
do $$
declare got text := '';
begin
  set local role anon;
  begin
    insert into public.reports (user_id, category, description, status, verification_status)
    values (null, 'security', 'forged', 'open', 'confirmed');
  exception when others then
    got := SQLSTATE;
  end;
  reset role;

  if got <> '42501' then
    raise exception 'expected insufficient_privilege (42501) on forged verification_status, got "%"', got;
  end if;
end $$;

-- 3. A legitimate report still inserts — the lockdown must not break the
--    existing reporting flow.
--
--    Deliberately no RETURNING: RETURNING additionally requires a SELECT
--    policy to pass, which is orthogonal to column grants. The app never hits
--    that because useReport.ts always sets user_id, so "Manage own reports"
--    covers both its insert and its .select('id').
do $$
declare n integer;
begin
  set local role anon;
  insert into public.reports (user_id, category, description, address,
                              is_anonymous, latitude, longitude, status)
  values (null, 'security', 'legitimate probe row', 'Ikeja, Lagos',
          true, 6.6018, 3.3515, 'open');
  reset role;

  select count(*) into n from public.reports where description = 'legitimate probe row';
  if n <> 1 then
    raise exception 'a legitimate report must still insert, found % rows', n;
  end if;
end $$;

-- 4. Clients cannot UPDATE reports at all (no code path does).
do $$
begin
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema='public' and table_name='reports'
      and grantee in ('anon','authenticated') and privilege_type='UPDATE'
  ) then
    raise exception 'no client UPDATE grant on reports was expected';
  end if;
end $$;

rollback;
