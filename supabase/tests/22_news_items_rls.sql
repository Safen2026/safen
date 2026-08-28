do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'news_items'
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'a client must never be able to publish into the feed';
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='news_items'
      and grantee='authenticated' and privilege_type='SELECT'
  ) then
    raise exception 'authenticated must be able to read the feed';
  end if;

  if not exists (
    select 1 from pg_policies where tablename='news_items' and policyname='news_items_read'
  ) then raise exception 'read policy missing'; end if;

  if not exists (
    select 1 from pg_class where relname='news_items' and relrowsecurity
  ) then raise exception 'RLS not enabled on news_items'; end if;

  -- severity is constrained
  if not exists (
    select 1 from information_schema.check_constraints cc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = cc.constraint_name
    where ccu.table_name='news_items' and ccu.column_name='severity'
  ) then raise exception 'severity check constraint missing'; end if;
end $$;
