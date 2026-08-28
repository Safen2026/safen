-- Durable ingest queue. Separating this from enrichment means a Claude outage
-- cannot lose already-fetched articles; the backlog drains on the next tick.
create table if not exists public.news_items_raw (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.news_sources(id) on delete cascade,
  url          text not null,
  url_hash     text not null unique,
  title        text not null,
  raw_summary  text not null default '',
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  status       text not null default 'pending'
                 check (status in ('pending','enriched','rejected','failed')),
  attempts     integer not null default 0,
  last_error   text
);

create index if not exists news_items_raw_pending_idx
  on public.news_items_raw (status, fetched_at)
  where status = 'pending';

alter table public.news_items_raw enable row level security;
revoke all on public.news_items_raw from anon, authenticated;
