alter table public.reports add column if not exists quality_token      text;
alter table public.reports add column if not exists quality_checked_at timestamptz;
alter table public.reports add column if not exists quality_status     text;
alter table public.reports add column if not exists gate_reason        text;

create or replace function public.enforce_report_quality_gate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.app_settings;
  tok    public.report_quality_tokens;
  reason text := null;
begin
  s := public.current_settings();

  if new.quality_token is null then
    reason := 'QUALITY_GATE_TOKEN_MISSING';
  else
    select * into tok from public.report_quality_tokens
     where token_sha256 = public.sha256_hex(new.quality_token)
     -- FOR UPDATE is load-bearing: without the row lock two concurrent
     -- inserts carrying the same token both read used_at as null, both
     -- pass, and a single-use token admits two reports. The lock makes the
     -- second transaction wait, then re-read the committed used_at.
     for update;

    if not found then                                   reason := 'QUALITY_GATE_TOKEN_UNKNOWN';
    elsif tok.used_at is not null then                  reason := 'QUALITY_GATE_TOKEN_USED';
    elsif tok.expires_at < now() then                   reason := 'QUALITY_GATE_TOKEN_EXPIRED';
    elsif tok.user_id is distinct from new.user_id then reason := 'QUALITY_GATE_TOKEN_WRONG_USER';
    elsif tok.payload_fingerprint is distinct from
          public.report_payload_fingerprint(new.category, new.description) then
      reason := 'QUALITY_GATE_PAYLOAD_MISMATCH';
    end if;
  end if;

  if reason is null then
    update public.report_quality_tokens set used_at = now()
     where id = tok.id and used_at is null;
    new.quality_status     := tok.verdict;
    new.quality_checked_at := now();
    new.gate_reason        := null;
  else
    if s.quality_gate_mode = 'enforcing' then
      raise exception '%', reason using errcode = 'P0001';
    end if;
    -- Unconditional, not coalesce: this trigger owns the column outright.
    -- A coalesce would let a client that supplied quality_status='passed'
    -- in its own INSERT keep that forged value on a failed gate.
    new.quality_status := 'advisory_failed';
    new.gate_reason    := reason;
  end if;

  new.quality_token := null;   -- never persist the plaintext token
  return new;
end $$;

drop trigger if exists trg_report_quality_gate on public.reports;
create trigger trg_report_quality_gate
  before insert on public.reports
  for each row execute function public.enforce_report_quality_gate();
