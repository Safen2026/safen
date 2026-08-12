create table if not exists public.report_quality_tokens (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  token_sha256        text        not null unique,
  payload_fingerprint text        not null,
  verdict             text        not null default 'passed'
                        check (verdict in ('passed', 'skipped_ai_unavailable', 'skipped_quota')),
  priority            text        check (priority in ('critical', 'high', 'medium', 'low')),
  expires_at          timestamptz not null,
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists report_quality_tokens_user_idx
  on public.report_quality_tokens (user_id, created_at desc);

-- RLS on, and deliberately NO policy: the service role bypasses RLS, every
-- other role is denied. This table is what stands between a client and a
-- forged pass.
alter table public.report_quality_tokens enable row level security;
