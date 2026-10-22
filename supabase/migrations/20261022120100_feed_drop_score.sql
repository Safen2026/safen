-- ════════════════════════════════════════════════════════════════════
-- feed_drop_score
--
-- Since 20261012120000_feed_newest_first the feed is ordered by time, so
-- feed_row.score is computed for nothing. It still went over the wire,
-- where anyone inspecting traffic could reverse out the ranking weights,
-- and the client type never read it. Drop it.
--
-- Changing a composite type means dropping it, which cascades to the
-- three functions returning it; they are recreated here unchanged apart
-- from the missing column. The weight helpers stay defined.
-- ════════════════════════════════════════════════════════════════════

drop type if exists public.feed_row cascade;

create type public.feed_row as (
  kind         text,
  id           uuid,
  headline     text,
  summary      text,
  advice       text,
  category     text,
  severity     text,
  occurred_at  timestamptz,
  state_code   text,
  lga_code     text,
  lat          double precision,
  lng          double precision,
  source_label text,
  deep_link    text
);

create or replace function public.get_area_news_items(
  p_state_code text, p_lga_code text, p_limit integer, p_before timestamptz
) returns setof public.feed_row
language sql stable security invoker as $$
  select
    'news'::text,
    n.id,
    n.headline,
    n.summary,
    n.advice,
    n.category,
    n.severity,
    n.published_at,
    n.state_code,
    n.lga_code,
    n.lat,
    n.lng,
    n.source_name,
    n.source_url
  from public.news_items n
  where n.unpublished_at is null
    and (p_before is null or n.published_at < p_before)
    and (n.is_national or p_state_code is null or n.state_code = p_state_code)
  order by n.published_at desc
  limit greatest(p_limit, 0);
$$;

-- CONFIRMED clusters only; see 20260827120700_feed_rpc.sql for why.
create or replace function public.get_area_community_items(
  p_lat double precision, p_lng double precision,
  p_limit integer, p_before timestamptz
) returns setof public.feed_row
language sql stable security invoker as $$
  select
    'community'::text,
    c.id,
    initcap(replace(c.category, '_', ' ')) || ' reported nearby',
    'Confirmed by ' || c.distinct_reporter_count::text
      || ' separate reports from people in this area.',
    null::text,
    c.category,
    case
      when c.distinct_reporter_count >= 5 then 'warning'
      when c.distinct_reporter_count >= 3 then 'caution'
      else 'info'
    end,
    c.last_reported_at,
    null::text,
    null::text,
    c.centroid_lat,
    c.centroid_lng,
    'Safen user reports',
    null::text
  from public.incident_clusters c
  where c.confirmed_at is not null
    and p_lat is not null
    and p_lng is not null
    and (p_before is null or c.last_reported_at < p_before)
  order by c.last_reported_at desc
  limit greatest(p_limit, 0);
$$;

create or replace function public.get_area_feed(
  p_state_code text default null,
  p_lga_code   text default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_limit      integer default 20,
  p_before     timestamptz default null
) returns setof public.feed_row
language sql stable security invoker as $$
  select * from (
    select * from public.get_area_news_items(p_state_code, p_lga_code, p_limit, p_before)
    union all
    select * from public.get_area_community_items(p_lat, p_lng, p_limit, p_before)
  ) merged
  -- id is a stable tiebreak for items sharing a timestamp.
  order by merged.occurred_at desc, merged.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) from public;
grant execute on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) to authenticated;
