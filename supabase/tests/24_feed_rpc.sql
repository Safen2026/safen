-- Ordering, seams and pagination for get_area_feed.
begin;

insert into public.news_sources (name, rss_url) values ('T', 'https://t.ng/feed')
  on conflict (rss_url) do nothing;

insert into public.news_items_raw (source_id, url, url_hash, title, status)
select id, 'https://t.ng/1', 'rpc-h1', 'near', 'enriched' from public.news_sources where name='T';
insert into public.news_items_raw (source_id, url, url_hash, title, status)
select id, 'https://t.ng/2', 'rpc-h2', 'far',  'enriched' from public.news_sources where name='T';
insert into public.news_items_raw (source_id, url, url_hash, title, status)
select id, 'https://t.ng/3', 'rpc-h3', 'old',  'enriched' from public.news_sources where name='T';

insert into public.news_items
  (raw_id, headline, summary, category, severity, confidence, state_code, lga_code,
   published_at, source_name, source_url)
select r.id, 'Near caution', 's', 'road_incident', 'caution', 0.90, 'LA', 'LA-ikeja',
       now(), 'T', 'https://t.ng/1'
from public.news_items_raw r where r.url_hash = 'rpc-h1';

insert into public.news_items
  (raw_id, headline, summary, category, severity, confidence, state_code, lga_code,
   published_at, source_name, source_url)
select r.id, 'Far critical', 's', 'terrorism', 'critical', 0.90, 'KN', 'KN-fagge',
       now(), 'T', 'https://t.ng/2'
from public.news_items_raw r where r.url_hash = 'rpc-h2';

-- Same LGA, more severe, but six hours older. Under the old score ordering
-- this outranked 'Near caution'; newest-first must put it second.
insert into public.news_items
  (raw_id, headline, summary, category, severity, confidence, state_code, lga_code,
   published_at, source_name, source_url)
select r.id, 'Older critical', 's', 'kidnapping', 'critical', 0.90, 'LA', 'LA-ikeja',
       now() - interval '6 hours', 'T', 'https://t.ng/3'
from public.news_items_raw r where r.url_hash = 'rpc-h3';

-- Two clusters near Ikeja: one confirmed, one not.
insert into public.incident_clusters
  (category, centroid_lat, centroid_lng, report_count, distinct_reporter_count,
   last_reported_at, confirmed_at)
values ('armed_robbery', 6.6018, 3.3515, 6, 5, now(), now());

insert into public.incident_clusters
  (category, centroid_lat, centroid_lng, report_count, distinct_reporter_count,
   last_reported_at, confirmed_at)
values ('kidnapping', 6.6020, 3.3520, 2, 2, now(), null);

do $$
declare first_headline text; n integer; d double precision;
begin
  -- Newest first: a fresh caution sits above an older critical in the same
  -- LGA, even though severity alone would rank the critical higher.
  select headline into first_headline
  from public.get_area_feed('LA','LA-ikeja', 6.6018, 3.3515, 10, null)
  where kind = 'news' limit 1;
  if first_headline is distinct from 'Near caution' then
    raise exception 'expected the newest news item first, got %', first_headline;
  end if;

  -- The whole feed is in time order, news and community interleaved.
  if exists (
    select 1 from (
      select occurred_at,
             lag(occurred_at) over (order by ordinality) as prev
      from public.get_area_feed('LA','LA-ikeja', 6.6018, 3.3515, 10, null)
           with ordinality
    ) t where t.occurred_at > t.prev
  ) then
    raise exception 'feed is not ordered newest first';
  end if;

  -- Another state's item never leaks in unless it is national.
  if exists (
    select 1 from public.get_area_feed('LA','LA-ikeja', 6.6018, 3.3515, 10, null)
    where headline = 'Far critical'
  ) then
    raise exception 'an out-of-state item leaked into the feed';
  end if;

  -- The community half now returns real confirmed clusters.
  select count(*) into n
  from public.get_area_community_items(6.6018, 3.3515, 10, null);
  if n <> 1 then
    raise exception 'expected exactly the 1 confirmed cluster, got %', n;
  end if;

  -- Unconfirmed clusters must never surface.
  if exists (
    select 1 from public.get_area_community_items(6.6018, 3.3515, 10, null)
    where category = 'kidnapping'
  ) then
    raise exception 'an unconfirmed cluster leaked into the feed';
  end if;

  -- Without coordinates the community half returns nothing rather than guessing.
  select count(*) into n from public.get_area_community_items(null, null, 10, null);
  if n <> 0 then
    raise exception 'community items must not appear without user coordinates, got %', n;
  end if;

  -- A user with no location still receives a feed (news half, national weight).
  select count(*) into n from public.get_area_feed(null, null, null, null, 10, null);
  if n < 1 then raise exception 'location-less users must still get a feed'; end if;

  -- Blended feed contains both kinds when coordinates are supplied.
  select count(distinct kind) into n
  from public.get_area_feed('LA','LA-ikeja', 6.6018, 3.3515, 10, null);
  if n <> 2 then raise exception 'expected both news and community kinds, got %', n; end if;

  -- Half-life is exactly 12 hours.
  select public.feed_recency_decay(now() - interval '12 hours') into d;
  if d not between 0.49 and 0.51 then
    raise exception 'half-life must be 12h, decay was %', d;
  end if;

  -- Distance bands.
  if public.feed_distance_weight(1000.0)  <> 1.0 then raise exception 'near band wrong'; end if;
  if public.feed_distance_weight(10000.0) <> 0.6 then raise exception 'mid band wrong';  end if;
  if public.feed_distance_weight(90000.0) <> 0.3 then raise exception 'far band wrong';  end if;

  -- Pagination: limit 1, then continue before that row's timestamp. The
  -- cursor is occurred_at, so the second page must hold the older item.
  select count(*) into n from public.get_area_feed('LA','LA-ikeja', null, null, 1, null);
  if n <> 1 then raise exception 'limit not honoured, got %', n; end if;

  select headline into first_headline
  from public.get_area_feed('LA','LA-ikeja', null, null, 1,
    (select occurred_at from public.get_area_feed('LA','LA-ikeja', null, null, 1, null)));
  if first_headline is distinct from 'Older critical' then
    raise exception 'second page should continue with the older item, got %', first_headline;
  end if;
end $$;

rollback;
