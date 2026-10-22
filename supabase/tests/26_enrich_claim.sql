-- Batch claiming for enrich-news: no row is handed out twice, stale claims
-- come back, exhausted rows never do.
begin;

insert into public.news_sources (name, rss_url) values ('T', 'https://t.ng/feed')
  on conflict (rss_url) do nothing;

-- Keep earlier fixtures out of the way so counts below are exact.
update public.news_items_raw set status = 'enriched' where status in ('pending', 'processing');

insert into public.news_items_raw (source_id, url, url_hash, title, fetched_at)
select id, 'https://t.ng/c' || g, 'claim-h' || g, 'item ' || g, now() - (g || ' minutes')::interval
from public.news_sources, generate_series(1, 3) g where name = 'T';

insert into public.news_items_raw (source_id, url, url_hash, title, attempts)
select id, 'https://t.ng/cx', 'claim-hx', 'exhausted', 3 from public.news_sources where name = 'T';

do $$
declare first_ids uuid[]; second_ids uuid[]; n integer;
begin
  select array_agg(id) into first_ids from public.claim_news_items_raw(2, 3);
  if coalesce(array_length(first_ids, 1), 0) <> 2 then
    raise exception 'expected 2 claimed rows, got %', first_ids;
  end if;

  -- Oldest first.
  if not (select url_hash = 'claim-h3' from public.news_items_raw where id = any(first_ids)
          order by fetched_at limit 1) then
    raise exception 'claim must take the oldest rows first';
  end if;

  if exists (select 1 from public.news_items_raw
             where id = any(first_ids) and (status <> 'processing' or claimed_at is null)) then
    raise exception 'claimed rows must be marked processing with claimed_at';
  end if;

  -- A second claim gets only what is left, never a row already held.
  select array_agg(id) into second_ids from public.claim_news_items_raw(10, 3);
  if coalesce(array_length(second_ids, 1), 0) <> 1 or second_ids && first_ids then
    raise exception 'second claim must return only the 1 unclaimed row, got %', second_ids;
  end if;

  -- Rows past MAX_ATTEMPTS are never claimed.
  if exists (select 1 from public.news_items_raw
             where url_hash = 'claim-hx' and status <> 'pending') then
    raise exception 'an exhausted row was claimed';
  end if;

  -- Nothing left: a fresh claim returns nothing.
  select count(*) into n from public.claim_news_items_raw(10, 3);
  if n <> 0 then raise exception 'expected an empty claim, got %', n; end if;

  -- A run that died leaves rows in processing; after 10 minutes they return.
  update public.news_items_raw set claimed_at = now() - interval '11 minutes'
   where id = first_ids[1];
  select count(*) into n from public.claim_news_items_raw(10, 3);
  if n <> 1 then raise exception 'expected the 1 stale claim back, got %', n; end if;

  -- Clients cannot drain the queue.
  if has_function_privilege('authenticated', 'public.claim_news_items_raw(integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.claim_news_items_raw(integer, integer)', 'execute') then
    raise exception 'claim_news_items_raw must not be executable by clients';
  end if;
end $$;

rollback;
