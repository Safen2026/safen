-- Allowlisted Nigerian news feeds. Service-role only: there is deliberately no
-- grant to `authenticated`, so no client can introduce a source URL.
--
-- The REVOKE is load-bearing, not decorative: this schema carries
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
-- so a new table is exposed to clients unless explicitly revoked.
create table if not exists public.news_sources (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  rss_url              text not null unique,
  enabled              boolean not null default true,
  last_fetched_at      timestamptz,
  consecutive_failures integer not null default 0,
  created_at           timestamptz not null default now()
);

alter table public.news_sources enable row level security;
revoke all on public.news_sources from anon, authenticated;

comment on column public.news_sources.consecutive_failures is
  'Auto-disabled at 5. RSS feeds break silently; without this the feed just thins out.';

insert into public.news_sources (name, rss_url) values
  ('Punch',         'https://punchng.com/feed/'),
  ('Vanguard',      'https://www.vanguardngr.com/feed/'),
  ('Premium Times', 'https://www.premiumtimesng.com/feed'),
  ('Channels TV',   'https://www.channelstv.com/feed/'),
  ('The Cable',     'https://www.thecable.ng/feed'),
  ('Daily Post',    'https://dailypost.ng/feed/')
on conflict (rss_url) do nothing;
