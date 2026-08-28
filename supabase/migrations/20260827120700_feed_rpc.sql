-- ════════════════════════════════════════════════════════════════════
-- feed_rpc
--
-- One ranked, paginated feed unioning two halves of different provenance.
--
-- The halves are matched differently on purpose. News items resolve to a
-- state/LGA, because that is the granularity Nigerian reporting actually uses.
-- incident_clusters carry only a centroid and no administrative codes, and the
-- gazetteer holds names rather than polygons, so a centroid cannot be mapped to
-- an LGA — community items are matched by distance instead.
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
  deep_link    text,
  score        double precision
);

create or replace function public.feed_severity_weight(p_severity text)
returns double precision language sql immutable as $$
  select case p_severity
    when 'critical' then 4.0
    when 'warning'  then 3.0
    when 'caution'  then 2.0
    else 1.0
  end;
$$;

-- Exponential decay, half-life exactly 12 hours.
create or replace function public.feed_recency_decay(p_at timestamptz)
returns double precision language sql stable as $$
  select power(0.5, extract(epoch from (now() - p_at)) / 43200.0);
$$;

create or replace function public.feed_proximity_weight(
  p_item_state text, p_item_lga text, p_user_state text, p_user_lga text
) returns double precision language sql immutable as $$
  select case
    when p_user_lga is not null and p_item_lga is not null and p_item_lga = p_user_lga then 1.0
    when p_user_state is not null and p_item_state = p_user_state then 0.6
    else 0.3
  end;
$$;

-- Distance band for community items, which have a centroid but no LGA.
create or replace function public.feed_distance_weight(p_metres double precision)
returns double precision language sql immutable as $$
  select case
    when p_metres is null      then 0.3
    when p_metres <=  5000.0   then 1.0
    when p_metres <= 25000.0   then 0.6
    else 0.3
  end;
$$;

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
    n.source_url,
    public.feed_severity_weight(n.severity)
      * public.feed_recency_decay(n.published_at)
      * public.feed_proximity_weight(n.state_code, n.lga_code, p_state_code, p_lga_code)
  from public.news_items n
  where n.unpublished_at is null
    and (p_before is null or n.published_at < p_before)
    and (n.is_national or p_state_code is null or n.state_code = p_state_code)
  order by n.published_at desc
  limit greatest(p_limit, 0);
$$;

-- Community half: CONFIRMED clusters only. Confirmation is derived by trigger
-- from distinct reporter counts, and reports.verification_status is now
-- server-assigned only (see 20260827120650_lock_down_report_columns.sql), so a
-- client cannot promote its own report into this feed.
--
-- With no user coordinates we return nothing rather than guessing: an
-- unplaceable local incident is worse than an absent one.
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
    null::text,
    public.feed_severity_weight(
      case
        when c.distinct_reporter_count >= 5 then 'warning'
        when c.distinct_reporter_count >= 3 then 'caution'
        else 'info'
      end)
      * public.feed_recency_decay(c.last_reported_at)
      * public.feed_distance_weight(
          public.haversine_meters(p_lat, p_lng, c.centroid_lat, c.centroid_lng))
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
  -- occurred_at then id are stable tiebreaks so pagination cannot repeat or
  -- skip rows when two items share a score.
  order by merged.score desc, merged.occurred_at desc, merged.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) from public;
grant execute on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) to authenticated;
