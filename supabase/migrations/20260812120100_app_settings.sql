create table if not exists public.app_settings (
  id                      boolean primary key default true,
  quality_gate_mode       text        not null default 'advisory'
                            check (quality_gate_mode in ('advisory', 'enforcing')),
  strike_threshold        integer     not null default 3,
  strike_window_minutes   integer     not null default 15,
  ban_minutes             integer     not null default 30,
  daily_call_ceiling      integer     not null default 40,
  min_description_words   integer     not null default 15,
  dupe_radius_meters      integer     not null default 500,
  dupe_window_minutes     integer     not null default 60,
  cluster_confirm_count   integer     not null default 5,
  updated_at              timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

create or replace function public.current_settings()
returns public.app_settings
language sql
stable
set search_path = public
as $$
  select * from public.app_settings limit 1;
$$;
