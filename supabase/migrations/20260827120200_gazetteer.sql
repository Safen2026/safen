-- Nigeria-first by design: this is an explicit state/LGA gazetteer, not a
-- generic i18n geography abstraction.
create table if not exists public.ng_states (
  code text primary key,
  name text not null unique
);

create table if not exists public.ng_lgas (
  code       text primary key,
  state_code text not null references public.ng_states(code) on delete cascade,
  name       text not null,
  unique (state_code, name)
);

-- An alias may be genuinely ambiguous ("Sabon Gari" exists in several states).
-- Ambiguity is represented as multiple rows and resolved by state context.
create table if not exists public.ng_place_aliases (
  id         uuid primary key default gen_random_uuid(),
  alias_norm text not null,
  state_code text not null references public.ng_states(code) on delete cascade,
  lga_code   text references public.ng_lgas(code) on delete cascade,
  unique (alias_norm, state_code, lga_code)
);

create index if not exists ng_place_aliases_norm_idx on public.ng_place_aliases (alias_norm);
create index if not exists ng_lgas_name_idx on public.ng_lgas (lower(name));

alter table public.ng_states        enable row level security;
alter table public.ng_lgas          enable row level security;
alter table public.ng_place_aliases enable row level security;

drop policy if exists ng_states_read  on public.ng_states;
drop policy if exists ng_lgas_read    on public.ng_lgas;
drop policy if exists ng_aliases_read on public.ng_place_aliases;

create policy ng_states_read  on public.ng_states        for select to authenticated using (true);
create policy ng_lgas_read    on public.ng_lgas          for select to authenticated using (true);
create policy ng_aliases_read on public.ng_place_aliases for select to authenticated using (true);

-- Read-only to clients. The REVOKE matters: this schema grants ALL on new
-- tables to anon/authenticated by default.
revoke all    on public.ng_states, public.ng_lgas, public.ng_place_aliases from anon, authenticated;
grant  select on public.ng_states, public.ng_lgas, public.ng_place_aliases to   authenticated;
