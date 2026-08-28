create table if not exists public.news_push_log (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  news_id uuid not null references public.news_items(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (user_id, news_id)
);

create index if not exists news_push_log_user_day_idx
  on public.news_push_log (user_id, sent_at desc);

alter table public.news_push_log enable row level security;
revoke all on public.news_push_log from anon, authenticated;

-- Atomically reserves one of the user's 3 daily slots. Returns false when the
-- cap is reached or this item was already sent to them.
--
-- These notifications share a channel with SOS and Safe Check-In. A feed that
-- trains users to mute Safen has broken the app's core function, so the cap is
-- enforced in the database rather than trusted to the caller. The unique
-- constraint is what makes it safe under concurrency: two simultaneous callers
-- can both pass the count check, but only one insert survives.
create or replace function public.claim_news_push(p_user_id uuid, p_news_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sent_today integer;
begin
  select count(*) into sent_today
  from public.news_push_log
  where user_id = p_user_id and sent_at > now() - interval '24 hours';

  if sent_today >= 3 then
    return false;
  end if;

  begin
    insert into public.news_push_log (user_id, news_id) values (p_user_id, p_news_id);
  exception when unique_violation then
    return false;
  end;

  return true;
end $$;

-- SECURITY DEFINER plus a public EXECUTE grant is how the previous spec shipped
-- functions that let any client mutate other users' state. Only the service
-- role calls this.
revoke all on function public.claim_news_push(uuid, uuid) from public, anon, authenticated;
