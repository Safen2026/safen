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
