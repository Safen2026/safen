-- The daily push cap must hold, because these notifications share a channel
-- with SOS and Safe Check-In.
begin;

do $$
declare
  u   uuid := gen_random_uuid();
  src uuid;
  ids uuid[];
  n   integer;
begin
  insert into auth.users (id, email) values (u, 'pushcap@example.test');

  insert into public.news_sources (name, rss_url) values ('P','https://p.ng/feed')
    on conflict (rss_url) do nothing;
  select id into src from public.news_sources where rss_url = 'https://p.ng/feed';

  for i in 1..4 loop
    insert into public.news_items_raw (source_id, url, url_hash, title, status)
      values (src, 'https://p.ng/'||i, 'push-h'||i, 't', 'enriched');
  end loop;

  insert into public.news_items (raw_id, headline, summary, category, severity,
    confidence, state_code, published_at, source_name, source_url)
  select r.id, 'h', 's', 'other', 'critical', 0.9, 'LA', now(), 'P', 'https://p.ng/x'
  from public.news_items_raw r where r.url_hash like 'push-h%';

  select array_agg(id order by created_at) into ids from public.news_items;

  if not public.claim_news_push(u, ids[1]) then raise exception 'claim 1 must succeed'; end if;
  if not public.claim_news_push(u, ids[2]) then raise exception 'claim 2 must succeed'; end if;
  if not public.claim_news_push(u, ids[3]) then raise exception 'claim 3 must succeed'; end if;

  -- Fourth exceeds the daily cap.
  if public.claim_news_push(u, ids[4]) then raise exception 'claim 4 must be capped'; end if;

  -- Re-claiming an already-sent item is refused, not double-sent.
  if public.claim_news_push(u, ids[1]) then raise exception 'duplicate claim must be refused'; end if;

  select count(*) into n from public.news_push_log where user_id = u;
  if n <> 3 then raise exception 'expected exactly 3 logged pushes, got %', n; end if;

  -- A claim older than the window does not count against today.
  update public.news_push_log set sent_at = now() - interval '48 hours' where user_id = u;
  if not public.claim_news_push(u, ids[4]) then
    raise exception 'expired claims must free a slot';
  end if;
end $$;

-- Not reachable from PostgREST.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='news_push_log'
      and grantee in ('anon','authenticated')
  ) then raise exception 'news_push_log must be service-role only'; end if;

  if has_function_privilege('authenticated', 'public.claim_news_push(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated must not be able to call claim_news_push';
  end if;
end $$;

rollback;
