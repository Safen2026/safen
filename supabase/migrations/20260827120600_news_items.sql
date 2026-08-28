create table if not exists public.news_items (
  id             uuid primary key default gen_random_uuid(),
  raw_id         uuid not null unique references public.news_items_raw(id) on delete cascade,
  headline       text not null,
  summary        text not null,
  advice         text,
  category       text not null,
  severity       text not null check (severity in ('info','caution','warning','critical')),
  confidence     numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  state_code     text references public.ng_states(code),
  lga_code       text references public.ng_lgas(code),
  -- lat/lng are deliberately NOT populated by the news path: inventing a point
  -- for "bandits attacked Birnin Gwari LGA" claims precision the source does
  -- not have. They exist so the community half, whose incident_clusters rows
  -- carry real centroids, can fill them through the same feed row shape.
  lat            double precision,
  lng            double precision,
  is_national    boolean not null default false,
  published_at   timestamptz not null,
  source_name    text not null,
  source_url     text not null,
  unpublished_at timestamptz,
  created_at     timestamptz not null default now()
);

-- Written to serve get_area_feed's actual predicates.
create index if not exists news_items_area_idx
  on public.news_items (state_code, lga_code, published_at desc)
  where unpublished_at is null;

create index if not exists news_items_national_idx
  on public.news_items (is_national, published_at desc)
  where unpublished_at is null;

alter table public.news_items enable row level security;

drop policy if exists news_items_read on public.news_items;
create policy news_items_read on public.news_items
  for select to authenticated
  using (unpublished_at is null);

-- Read-only to clients. There must be no path by which a client publishes
-- into the feed; this is the deliberate counterpoint to the reports table,
-- where a missing column REVOKE left verification_status client-writable.
revoke all    on public.news_items from anon, authenticated;
grant  select on public.news_items to   authenticated;
