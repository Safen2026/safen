-- Assertions for news_sources / news_items_raw.
-- Raises an exception on failure; silence means pass.
begin;

do $$
begin
  if (select count(*) from public.news_sources) < 6 then
    raise exception 'expected the 6 seeded sources, found %',
      (select count(*) from public.news_sources);
  end if;

  -- This schema grants ALL on new tables to clients by default, so the
  -- REVOKE in the migration is the only thing keeping the queue private.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('news_sources','news_items_raw')
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'news ingest tables must not be reachable from PostgREST';
  end if;
end $$;

-- url_hash uniqueness is the cross-source dedup guarantee
insert into public.news_items_raw (source_id, url, url_hash, title)
select id, 'https://a.ng/x', 'hash-dup-test', 'first' from public.news_sources limit 1;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.news_items_raw (source_id, url, url_hash, title)
    select id, 'https://b.ng/x', 'hash-dup-test', 'second' from public.news_sources limit 1;
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate url_hash must be rejected'; end if;
end $$;

-- status is constrained
do $$
declare ok boolean := false;
begin
  begin
    insert into public.news_items_raw (source_id, url, url_hash, title, status)
    select id, 'https://c.ng/x', 'hash-status-test', 'third', 'bogus'
    from public.news_sources limit 1;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'invalid status must be rejected'; end if;
end $$;

rollback;
