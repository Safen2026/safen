alter table public.reports add column if not exists last_seen_at     timestamptz;
alter table public.reports add column if not exists police_reference text;

create or replace function public.missing_person_gap(r public.reports)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when r.category <> 'missing_person'                       then null
    when coalesce(array_length(r.media_paths, 1), 0) = 0      then 'QUALITY_GATE_MISSING_PERSON_PHOTO'
    when r.last_seen_at is null                               then 'QUALITY_GATE_MISSING_PERSON_LAST_SEEN'
    when coalesce(btrim(r.police_reference), '') = ''         then 'QUALITY_GATE_MISSING_PERSON_POLICE_REF'
    when r.latitude is null or r.longitude is null            then 'QUALITY_GATE_MISSING_PERSON_LOCATION'
    else null
  end;
$$;

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
  pri    public.report_priority;
begin
  s := public.current_settings();

  -- Deterministic, AI-independent, and enforced even in advisory mode: these
  -- four fields are the brief's hard requirement for missing-person reports,
  -- and they never depended on the model.
  reason := public.missing_person_gap(new);
  if reason is not null then
    raise exception '%', reason using errcode = 'P0001';
  end if;

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

    pri := coalesce(tok.priority::public.report_priority, 'medium');
    new.priority      := pri;
    new.priority_rank := case pri when 'critical' then 4 when 'high' then 3
                                  when 'medium'   then 2 else 1 end;
    if tok.priority is null then
      new.triage_reason := case tok.verdict
        when 'skipped_ai_unavailable' then 'ai_unavailable'
        when 'skipped_quota'          then 'quota_exceeded'
        else 'unscored' end;
    end if;
  else
    if s.quality_gate_mode = 'enforcing' then
      raise exception '%', reason using errcode = 'P0001';
    end if;
    -- Unconditional, not coalesce: this trigger owns the column outright.
    -- A coalesce would let a client that supplied quality_status='passed'
    -- in its own INSERT keep that forged value on a failed gate.
    new.quality_status := 'advisory_failed';
    new.gate_reason    := reason;
    new.priority       := 'medium';
    new.priority_rank  := 2;
  end if;

  new.quality_token := null;
  return new;
end $$;
