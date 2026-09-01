alter table public.profiles add column if not exists trust_score          integer not null default 50;
alter table public.profiles add column if not exists reports_submitted    integer not null default 0;
alter table public.profiles add column if not exists reports_confirmed    integer not null default 0;
alter table public.profiles add column if not exists reports_flagged_fake integer not null default 0;

alter table public.reports add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'confirmed', 'rejected'));

create table if not exists public.report_flags (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  flagger_id uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  unique (report_id, flagger_id)
);

alter table public.report_flags enable row level security;

drop policy if exists report_flags_insert_own on public.report_flags;
create policy report_flags_insert_own on public.report_flags
  for insert to authenticated with check (flagger_id = auth.uid());

create table if not exists public.ai_usage_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete set null,
  function_name         text not null,
  model                 text not null,
  input_tokens          integer,
  output_tokens         integer,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  latency_ms            integer,
  outcome               text not null,
  created_at            timestamptz not null default now()
);

create index if not exists ai_usage_log_user_day_idx
  on public.ai_usage_log (user_id, created_at desc);

-- RLS on with no policy: service role only.
alter table public.ai_usage_log enable row level security;

create or replace function public.ai_calls_today(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.ai_usage_log
   where user_id = p_user and created_at > date_trunc('day', now());
$$;

-- Signal recording only. No scoring formula in Spec 1, per brief §3.
create or replace function public.record_report_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles set reports_submitted = reports_submitted + 1
     where id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_record_report_submitted on public.reports;
create trigger trg_record_report_submitted
  after insert on public.reports
  for each row execute function public.record_report_submitted();

-- Corroboration is the only confirmation signal that exists in Spec 1: when a
-- cluster reaches enough DISTINCT reporters, its reports become 'confirmed'
-- and each reporter's counter goes up. Still no scoring formula — this only
-- records the history a future formula would read.
create or replace function public.record_cluster_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.reports set verification_status = 'confirmed'
     where cluster_id = new.id and verification_status = 'pending';

    update public.profiles p set reports_confirmed = p.reports_confirmed + 1
     where p.id in (select distinct r.user_id from public.reports r
                     where r.cluster_id = new.id and r.user_id is not null);
  end if;
  return new;
end $$;

drop trigger if exists trg_record_cluster_confirmation on public.incident_clusters;
create trigger trg_record_cluster_confirmation
  after update on public.incident_clusters
  for each row execute function public.record_cluster_confirmation();

-- Replaces Task 7's cluster_report(). Two ordering defects made the trust
-- signals systematically wrong, and neither is visible from either migration
-- alone — they only exist in the interaction:
--   1. reports.cluster_id was written AFTER confirmed_at, so the report that
--      tipped a cluster over the threshold was invisible to the confirmation
--      sweep and its author was never credited.
--   2. record_cluster_confirmation fires only on the confirmed_at
--      null -> not null transition, i.e. once per cluster ever, so every
--      report joining an ALREADY confirmed cluster stayed 'pending' forever.
create or replace function public.cluster_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings;
  c uuid;
  v_confirmed timestamptz;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  s := public.current_settings();

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
    update public.reports set cluster_id = c where id = new.id;
    return new;
  end if;

  -- Claim membership BEFORE the cluster is evaluated, so a report that tips
  -- the threshold is included in the confirmation sweep it causes.
  update public.reports set cluster_id = c where id = new.id;

  update public.incident_clusters ic
     set report_count     = ic.report_count + 1,
         last_reported_at = now(),
         centroid_lat     = (ic.centroid_lat * ic.report_count + new.latitude)  / (ic.report_count + 1),
         centroid_lng     = (ic.centroid_lng * ic.report_count + new.longitude) / (ic.report_count + 1),
         -- cluster_id is already set above, so the new row is counted here and
         -- no "+ 1" fudge is needed.
         distinct_reporter_count = (
           select count(distinct r.user_id)
             from public.reports r
            where r.cluster_id = ic.id
         )
   where ic.id = c;

  update public.incident_clusters ic
     set confirmed_at = now()
   where ic.id = c
     and ic.confirmed_at is null
     and ic.distinct_reporter_count >= s.cluster_confirm_count;

  -- Late joiners inherit confirmation. Re-read the row rather than trusting
  -- NEW: if the sweep above already confirmed this report, NEW still shows the
  -- stale 'pending' and we would credit the author twice.
  select ic.confirmed_at into v_confirmed
    from public.incident_clusters ic where ic.id = c;

  if v_confirmed is not null
     and exists (select 1 from public.reports r
                  where r.id = new.id and r.verification_status = 'pending') then

    update public.reports set verification_status = 'confirmed' where id = new.id;

    if new.user_id is not null
       and not exists (select 1 from public.reports r2
                        where r2.cluster_id = c
                          and r2.id <> new.id
                          and r2.user_id = new.user_id) then
      update public.profiles p
         set reports_confirmed = p.reports_confirmed + 1
       where p.id = new.user_id;
    end if;
  end if;

  return new;
end $$;
