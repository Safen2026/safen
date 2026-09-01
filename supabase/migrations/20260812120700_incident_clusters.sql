create or replace function public.haversine_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

create table if not exists public.incident_clusters (
  id                      uuid primary key default gen_random_uuid(),
  category                text        not null,
  centroid_lat            double precision not null,
  centroid_lng            double precision not null,
  report_count            integer     not null default 0,
  distinct_reporter_count integer     not null default 0,
  first_reported_at       timestamptz not null default now(),
  last_reported_at        timestamptz not null default now(),
  confirmed_at            timestamptz
);

alter table public.reports add column if not exists cluster_id uuid
  references public.incident_clusters(id) on delete set null;

create index if not exists reports_geo_time_idx
  on public.reports (category, created_at desc)
  where latitude is not null;

alter table public.incident_clusters enable row level security;

drop policy if exists incident_clusters_read on public.incident_clusters;
create policy incident_clusters_read on public.incident_clusters
  for select to authenticated using (true);

create or replace function public.cluster_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings;
  c uuid;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  s := public.current_settings();

  -- Bounding-box prefilter on the btree index, then exact haversine.
  -- 1 degree of latitude is ~111,320m; longitude is scaled by cos(lat).
  select ic.id into c
    from public.incident_clusters ic
   where ic.category = new.category
     and ic.last_reported_at > now() - make_interval(mins => s.dupe_window_minutes)
     and ic.centroid_lat between new.latitude  - (s.dupe_radius_meters / 111320.0)
                             and new.latitude  + (s.dupe_radius_meters / 111320.0)
     and ic.centroid_lng between new.longitude - (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
                             and new.longitude + (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
     and public.haversine_meters(ic.centroid_lat, ic.centroid_lng, new.latitude, new.longitude)
         <= s.dupe_radius_meters
   order by ic.last_reported_at desc
   limit 1;

  if c is null then
    insert into public.incident_clusters (category, centroid_lat, centroid_lng,
                                          report_count, distinct_reporter_count)
    values (new.category, new.latitude, new.longitude, 1, 1)
    returning id into c;
  else
    update public.incident_clusters ic
       set report_count     = ic.report_count + 1,
           last_reported_at = now(),
           centroid_lat     = (ic.centroid_lat * ic.report_count + new.latitude)  / (ic.report_count + 1),
           centroid_lng     = (ic.centroid_lng * ic.report_count + new.longitude) / (ic.report_count + 1),
           distinct_reporter_count = (
             select count(distinct r.user_id) + 1
               from public.reports r
              where r.cluster_id = ic.id and r.user_id is distinct from new.user_id
           )
     where ic.id = c;

    update public.incident_clusters ic
       set confirmed_at = now()
     where ic.id = c
       and ic.confirmed_at is null
       and ic.distinct_reporter_count >= s.cluster_confirm_count;
  end if;

  update public.reports set cluster_id = c where id = new.id;
  return new;
end $$;

drop trigger if exists trg_cluster_report on public.reports;
create trigger trg_cluster_report
  after insert on public.reports
  for each row execute function public.cluster_report();
