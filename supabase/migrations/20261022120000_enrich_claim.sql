-- ════════════════════════════════════════════════════════════════════
-- enrich_claim
--
-- enrich-news read its batch with a plain SELECT of pending rows, so two
-- overlapping runs (a slow Anthropic batch past the 10-minute cadence, or
-- a manual invocation) picked up the same rows and classified each twice.
-- news_items.raw_id is unique, so the second insert failed, but its error
-- path then reset the row to 'pending' over the first run's 'enriched' and
-- the row was classified again until it ended as 'failed' — paid for, and
-- mislabelled, despite being published.
--
-- claim_news_items_raw marks a batch 'processing' and returns it in one
-- statement. FOR UPDATE SKIP LOCKED means a concurrent claim skips rows
-- another run holds instead of waiting for, or re-reading, them.
--
-- A run that dies mid-batch would strand its rows in 'processing', so a
-- claim older than 10 minutes is taken back. Edge functions are killed
-- well before that, so a live run never has its rows reclaimed.
-- ════════════════════════════════════════════════════════════════════

alter table public.news_items_raw drop constraint if exists news_items_raw_status_check;
alter table public.news_items_raw add constraint news_items_raw_status_check
  check (status in ('pending','processing','enriched','rejected','failed'));

alter table public.news_items_raw add column if not exists claimed_at timestamptz;

create or replace function public.claim_news_items_raw(p_limit integer, p_max_attempts integer)
returns setof public.news_items_raw
language sql volatile security invoker set search_path = public as $$
  update public.news_items_raw r
     set status = 'processing', claimed_at = now()
   where r.id in (
     select q.id from public.news_items_raw q
      where q.attempts < p_max_attempts
        and (q.status = 'pending'
             or (q.status = 'processing' and q.claimed_at < now() - interval '10 minutes'))
      order by q.fetched_at
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning r.*;
$$;

-- Only the service-role edge function drains the queue.
revoke all on function public.claim_news_items_raw(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_news_items_raw(integer, integer) to service_role;
