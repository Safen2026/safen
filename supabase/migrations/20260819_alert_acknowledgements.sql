-- ════════════════════════════════════════════════════════════════════
-- alert_acknowledgements
-- Tracks how each emergency contact responded to an SOS/alert.
-- One row per (alert, contact). The contact can only respond once;
-- subsequent calls upsert so they can update their status.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.alert_acknowledgements (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references public.alerts(id) on delete cascade,
  contact_id    uuid not null references auth.users(id) on delete cascade,
  response      text not null check (response in ('on_my_way', 'calling_you', 'alerting_authorities', 'cant_help')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One response per contact per alert (upsertable)
  unique (alert_id, contact_id)
);

-- RLS: only the alert owner or the contact themselves can read rows.
-- The contact can insert/update their own row. Nobody can delete.
alter table public.alert_acknowledgements enable row level security;

create policy "Alert owner can read acknowledgements"
  on public.alert_acknowledgements for select
  using (
    auth.uid() = contact_id
    or auth.uid() = (select user_id from public.alerts where id = alert_id)
  );

create policy "Contact can upsert their own acknowledgement"
  on public.alert_acknowledgements for insert
  with check (auth.uid() = contact_id);

create policy "Contact can update their own acknowledgement"
  on public.alert_acknowledgements for update
  using (auth.uid() = contact_id)
  with check (auth.uid() = contact_id);

-- Auto-update updated_at on row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger alert_acknowledgements_updated_at
  before update on public.alert_acknowledgements
  for each row execute function public.set_updated_at();

-- Index for fast look-up by alert_id (used when the SOS sender checks responses)
create index if not exists alert_acknowledgements_alert_id_idx
  on public.alert_acknowledgements (alert_id);
