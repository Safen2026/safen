create extension if not exists pgcrypto with schema extensions;

create or replace function public.sha256_hex(p_text text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_text, ''), 'sha256'), 'hex');
$$;

-- Normalisation MUST stay byte-identical to normalise() in
-- supabase/functions/check-report-quality/fingerprint.ts. The character class is explicit
-- rather than [[:space:]] so the two engines cannot disagree on Unicode spaces.
-- btrim() with no second argument strips only ASCII space (not Unicode spaces like U+00A0).
-- This default MUST NOT be changed to a Unicode-aware trim, or TS/SQL fingerprints will drift.
create or replace function public.report_payload_fingerprint(p_category text, p_description text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select public.sha256_hex(
    lower(btrim(regexp_replace(coalesce(p_category, ''),    E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
    || E'\n' ||
    lower(btrim(regexp_replace(coalesce(p_description, ''), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
  );
$$;
