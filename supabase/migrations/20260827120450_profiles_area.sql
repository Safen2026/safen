-- The push notifier needs to know which LGA a user is in; profiles had no
-- such column. Written by the client in useSafetyFeed's resolveArea, read by
-- notify-news. A user whose area never resolved stays null and is correctly
-- excluded from area-targeted pushes.
alter table public.profiles
  add column if not exists last_state_code text references public.ng_states(code),
  add column if not exists last_lga_code   text references public.ng_lgas(code),
  add column if not exists area_updated_at timestamptz;

create index if not exists profiles_last_lga_idx
  on public.profiles (last_lga_code)
  where last_lga_code is not null;
