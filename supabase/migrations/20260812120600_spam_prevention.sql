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
  s         public.app_settings;
  v_last    timestamptz;
  v_at_last integer;
begin
  s := public.current_settings();

  -- What the user is shown ("2 of 3"): strikes still inside the rolling
  -- window relative to now. This decays as strikes age out.
  select count(*)::int into strike_count
    from public.report_strikes
   where user_id = p_user
     and created_at > now() - make_interval(mins => s.strike_window_minutes);

  select max(created_at) into v_last
    from public.report_strikes
   where user_id = p_user;

  banned_until := null;

  if v_last is not null then
    -- Was the threshold met AT THE MOMENT of the most recent strike?
    -- Deriving the ban from the live window instead would let it expire as
    -- soon as the triggering strikes aged out — capping every ban at
    -- strike_window_minutes and silently ignoring ban_minutes entirely
    -- (with the defaults, a "30 minute" ban really lasted about 15).
    select count(*)::int into v_at_last
      from public.report_strikes
     where user_id = p_user
       and created_at <= v_last
       and created_at >  v_last - make_interval(mins => s.strike_window_minutes);

    if v_at_last >= s.strike_threshold
       and v_last + make_interval(mins => s.ban_minutes) > now() then
      banned_until := v_last + make_interval(mins => s.ban_minutes);
    end if;
  end if;

  return next;
end $$;
