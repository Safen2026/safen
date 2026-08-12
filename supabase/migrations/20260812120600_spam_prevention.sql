create table if not exists public.report_strikes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  reason     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists report_strikes_user_time_idx
  on public.report_strikes (user_id, created_at desc);

alter table public.report_strikes enable row level security;

drop policy if exists report_strikes_read_own on public.report_strikes;
create policy report_strikes_read_own on public.report_strikes
  for select to authenticated using (user_id = auth.uid());

create or replace function public.record_strike(p_user uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.report_strikes (user_id, reason) values (p_user, p_reason);
$$;

-- Ban state is DERIVED, never stored: no expiry job, no stuck ban to clean up.
create or replace function public.strike_state(p_user uuid)
returns table (strike_count integer, banned_until timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.app_settings;
begin
  s := current_settings();

  select count(*)::int, max(created_at)
    into strike_count, banned_until
    from public.report_strikes
   where user_id = p_user
     and created_at > now() - make_interval(mins => s.strike_window_minutes);

  if strike_count >= s.strike_threshold then
    banned_until := banned_until + make_interval(mins => s.ban_minutes);
    if banned_until <= now() then banned_until := null; end if;
  else
    banned_until := null;
  end if;

  return next;
end $$;
