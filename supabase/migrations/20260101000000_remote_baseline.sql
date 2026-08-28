-- ════════════════════════════════════════════════════════════════════
-- remote_baseline
--
-- Captured from the linked production project (ujbknxfvatvtwthxtytu) with
-- `supabase db pull` on 2026-08-28. Before this file existed the repo had NO
-- baseline schema: profiles, notifications, alerts, reports and the rest were
-- created directly in the dashboard, so no migration could ever be replayed
-- from an empty database. That is why `supabase start` failed outright and why
-- the feat/ai-features migrations were never rehearsed.
--
-- NOTE: this snapshot already contains the feat/ai-features (Spec 1) objects —
-- incident_clusters, app_settings, report_quality_tokens, report_strikes,
-- ai_usage_log, report_flags — because those migrations reached production
-- even though that branch was never merged.
--
-- Its version is NOT in the remote migration history. Until it is marked
-- applied, `supabase db push` will try to replay it against production and
-- fail on already-existing objects.
-- ════════════════════════════════════════════════════════════════════




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."report_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE "public"."report_priority" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_calls_today"("p_user" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int from public.ai_usage_log
   where user_id = p_user and created_at > date_trunc('day', now());
$$;


ALTER FUNCTION "public"."ai_calls_today"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cluster_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.app_settings;
  c uuid;
  v_confirmed timestamptz;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  s := public.current_settings();

  select ic.id into c
    from public.incident_clusters ic
   where ic.category = new.category
     and ic.last_reported_at > now() - make_interval(mins => s.dupe_window_minutes)
     and ic.centroid_lat between new.latitude  - (s.dupe_radius_meters / 111320.0)
                             and new.latitude  + (s.dupe_radius_meters / 111320.0)
     and ic.centroid_lng between new.longitude - (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
                             and new.longitude + (s.dupe_radius_meters / (111320.0 * cos(radians(new.latitude))))
     and public.haversine_meters(ic.centroid_lat, ic.centroid_lng, new.latitude, new.longitude)
         <= s.dupe_radius_meters
   order by ic.last_reported_at desc
   limit 1;

  if c is null then
    insert into public.incident_clusters (category, centroid_lat, centroid_lng,
                                          report_count, distinct_reporter_count)
    values (new.category, new.latitude, new.longitude, 1, 1)
    returning id into c;
    update public.reports set cluster_id = c where id = new.id;
    return new;
  end if;

  -- Claim membership BEFORE the cluster is evaluated, so a report that tips
  -- the threshold is included in the confirmation sweep it causes.
  update public.reports set cluster_id = c where id = new.id;

  update public.incident_clusters ic
     set report_count     = ic.report_count + 1,
         last_reported_at = now(),
         centroid_lat     = (ic.centroid_lat * ic.report_count + new.latitude)  / (ic.report_count + 1),
         centroid_lng     = (ic.centroid_lng * ic.report_count + new.longitude) / (ic.report_count + 1),
         -- cluster_id is already set above, so the new row is counted here and
         -- no "+ 1" fudge is needed.
         distinct_reporter_count = (
           select count(distinct r.user_id)
             from public.reports r
            where r.cluster_id = ic.id
         )
   where ic.id = c;

  update public.incident_clusters ic
     set confirmed_at = now()
   where ic.id = c
     and ic.confirmed_at is null
     and ic.distinct_reporter_count >= s.cluster_confirm_count;

  -- Late joiners inherit confirmation. Re-read the row rather than trusting
  -- NEW: if the sweep above already confirmed this report, NEW still shows the
  -- stale 'pending' and we would credit the author twice.
  select ic.confirmed_at into v_confirmed
    from public.incident_clusters ic where ic.id = c;

  if v_confirmed is not null
     and exists (select 1 from public.reports r
                  where r.id = new.id and r.verification_status = 'pending') then

    update public.reports set verification_status = 'confirmed' where id = new.id;

    if new.user_id is not null
       and not exists (select 1 from public.reports r2
                        where r2.cluster_id = c
                          and r2.id <> new.id
                          and r2.user_id = new.user_id) then
      update public.profiles p
         set reports_confirmed = p.reports_confirmed + 1
       where p.id = new.user_id;
    end if;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."cluster_report"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "quality_gate_mode" "text" DEFAULT 'advisory'::"text" NOT NULL,
    "strike_threshold" integer DEFAULT 3 NOT NULL,
    "strike_window_minutes" integer DEFAULT 15 NOT NULL,
    "ban_minutes" integer DEFAULT 30 NOT NULL,
    "daily_call_ceiling" integer DEFAULT 40 NOT NULL,
    "min_description_words" integer DEFAULT 15 NOT NULL,
    "dupe_radius_meters" integer DEFAULT 500 NOT NULL,
    "dupe_window_minutes" integer DEFAULT 60 NOT NULL,
    "cluster_confirm_count" integer DEFAULT 5 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_settings_quality_gate_mode_check" CHECK (("quality_gate_mode" = ANY (ARRAY['advisory'::"text", 'enforcing'::"text"]))),
    CONSTRAINT "app_settings_singleton" CHECK ("id")
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_settings"() RETURNS "public"."app_settings"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select * from public.app_settings limit 1;
$$;


ALTER FUNCTION "public"."current_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from auth.users where id = auth.uid();
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_report_quality_gate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."enforce_report_quality_gate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_medical_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.medical_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_medical_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.phone,
    new.email
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haversine_meters"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;


ALTER FUNCTION "public"."haversine_meters"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "category" "text" NOT NULL,
    "description" "text",
    "latitude" double precision,
    "longitude" double precision,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "media_paths" "text"[],
    "address" "text",
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "quality_token" "text",
    "quality_checked_at" timestamp with time zone,
    "quality_status" "text",
    "gate_reason" "text",
    "priority" "public"."report_priority",
    "priority_rank" smallint,
    "triage_reason" "text",
    "last_seen_at" timestamp with time zone,
    "police_reference" "text",
    "cluster_id" "uuid",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text"]))),
    CONSTRAINT "reports_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."missing_person_gap"("r" "public"."reports") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when r.category <> 'missing_person'                       then null
    when coalesce(array_length(r.media_paths, 1), 0) = 0      then 'QUALITY_GATE_MISSING_PERSON_PHOTO'
    when r.last_seen_at is null                               then 'QUALITY_GATE_MISSING_PERSON_LAST_SEEN'
    when coalesce(btrim(r.police_reference), '') = ''         then 'QUALITY_GATE_MISSING_PERSON_POLICE_REF'
    when r.latitude is null or r.longitude is null            then 'QUALITY_GATE_MISSING_PERSON_LOCATION'
    else null
  end;
$$;


ALTER FUNCTION "public"."missing_person_gap"("r" "public"."reports") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_cluster_confirmation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.reports set verification_status = 'confirmed'
     where cluster_id = new.id and verification_status = 'pending';

    update public.profiles p set reports_confirmed = p.reports_confirmed + 1
     where p.id in (select distinct r.user_id from public.reports r
                     where r.cluster_id = new.id and r.user_id is not null);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."record_cluster_confirmation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_report_submitted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.user_id is not null then
    update public.profiles set reports_submitted = reports_submitted + 1
     where id = new.user_id;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."record_report_submitted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_strike"("p_user" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.report_strikes (user_id, reason) values (p_user, p_reason);
$$;


ALTER FUNCTION "public"."record_strike"("p_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_payload_fingerprint"("p_category" "text", "p_description" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select public.sha256_hex(
    lower(btrim(regexp_replace(coalesce(p_category, ''),    E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
    || E'\n' ||
    lower(btrim(regexp_replace(coalesce(p_description, ''), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g')))
  );
$$;


ALTER FUNCTION "public"."report_payload_fingerprint"("p_category" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_contact_request"("p_sender_id" "uuid", "p_action" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verify the caller is actually the contact for this request before updating
  IF NOT EXISTS (
    SELECT 1 FROM emergency_contacts
    WHERE user_id = p_sender_id
      AND contact_user_id = auth.uid()
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'No pending contact request found';
  END IF;

  UPDATE emergency_contacts
  SET status = p_action
  WHERE user_id = p_sender_id
    AND contact_user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."respond_to_contact_request"("p_sender_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sha256_hex"("p_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select encode(extensions.digest(coalesce(p_text, ''), 'sha256'), 'hex');
$$;


ALTER FUNCTION "public"."sha256_hex"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strike_state"("p_user" "uuid") RETURNS TABLE("strike_count" integer, "banned_until" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."strike_state"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upgrade_emergency_contacts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.emergency_contacts
  SET is_on_app = true,
      contact_user_id = NEW.id
  WHERE phone = NEW.phone
    AND is_on_app = false;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."upgrade_emergency_contacts"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "function_name" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer,
    "cache_creation_tokens" integer,
    "latency_ms" integer,
    "outcome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "response" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "alert_acknowledgements_response_check" CHECK (("response" = ANY (ARRAY['on_my_way'::"text", 'calling_you'::"text", 'alerting_authorities'::"text", 'cant_help'::"text"])))
);


ALTER TABLE "public"."alert_acknowledgements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "description" "text",
    "media_paths" "text"[],
    CONSTRAINT "alerts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text", 'resolved'::"text"]))),
    CONSTRAINT "alerts_type_check" CHECK (("type" = ANY (ARRAY['sos'::"text", 'medical'::"text", 'police'::"text", 'fire'::"text"])))
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_on_app" boolean DEFAULT false,
    "contact_user_id" "uuid",
    "status" "text" DEFAULT 'accepted'::"text"
);


ALTER TABLE "public"."emergency_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_clusters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "centroid_lat" double precision NOT NULL,
    "centroid_lng" double precision NOT NULL,
    "report_count" integer DEFAULT 0 NOT NULL,
    "distinct_reporter_count" integer DEFAULT 0 NOT NULL,
    "first_reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone
);


ALTER TABLE "public"."incident_clusters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "blood_type" "text",
    "height_cm" numeric,
    "weight_kg" numeric,
    "is_organ_donor" boolean DEFAULT false,
    "allergies" "jsonb" DEFAULT '[]'::"jsonb",
    "conditions" "text"[] DEFAULT '{}'::"text"[],
    "medications" "text"[] DEFAULT '{}'::"text"[],
    "doctor_name" "text",
    "doctor_phone" "text",
    "doctor_hospital" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "medical_profiles_blood_type_check" CHECK (("blood_type" = ANY (ARRAY['A+'::"text", 'A-'::"text", 'B+'::"text", 'B-'::"text", 'AB+'::"text", 'AB-'::"text", 'O+'::"text", 'O-'::"text"])))
);


ALTER TABLE "public"."medical_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_name" "text",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "alert_id" "uuid",
    "report_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['sos'::"text", 'medical'::"text", 'police'::"text", 'fire'::"text", 'report'::"text", 'contact_added'::"text", 'ping'::"text", 'ping_ack'::"text", 'check_in_missed'::"text", 'check_in_reminder'::"text", 'check_in_deadline'::"text", 'journey_started'::"text", 'journey_arrived'::"text", 'sos_ack'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "email" "text",
    "is_at_home" boolean DEFAULT true,
    "auto_notify" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "expo_push_token" "text",
    "push_enabled" boolean DEFAULT true,
    "medical_reminder_sent_at" timestamp with time zone,
    "trust_score" integer DEFAULT 50 NOT NULL,
    "reports_submitted" integer DEFAULT 0 NOT NULL,
    "reports_confirmed" integer DEFAULT 0 NOT NULL,
    "reports_flagged_fake" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "flagger_id" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_quality_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_sha256" "text" NOT NULL,
    "payload_fingerprint" "text" NOT NULL,
    "verdict" "text" DEFAULT 'passed'::"text" NOT NULL,
    "priority" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_quality_tokens_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "report_quality_tokens_verdict_check" CHECK (("verdict" = ANY (ARRAY['passed'::"text", 'skipped_ai_unavailable'::"text", 'skipped_quota'::"text"])))
);


ALTER TABLE "public"."report_quality_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_strikes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_strikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sos_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."sos_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_acknowledgements"
    ADD CONSTRAINT "alert_acknowledgements_alert_id_contact_id_key" UNIQUE ("alert_id", "contact_id");



ALTER TABLE ONLY "public"."alert_acknowledgements"
    ADD CONSTRAINT "alert_acknowledgements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_clusters"
    ADD CONSTRAINT "incident_clusters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_profiles"
    ADD CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_profiles"
    ADD CONSTRAINT "medical_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_flags"
    ADD CONSTRAINT "report_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_flags"
    ADD CONSTRAINT "report_flags_report_id_flagger_id_key" UNIQUE ("report_id", "flagger_id");



ALTER TABLE ONLY "public"."report_quality_tokens"
    ADD CONSTRAINT "report_quality_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_quality_tokens"
    ADD CONSTRAINT "report_quality_tokens_token_sha256_key" UNIQUE ("token_sha256");



ALTER TABLE ONLY "public"."report_strikes"
    ADD CONSTRAINT "report_strikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sos_events"
    ADD CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_usage_log_user_day_idx" ON "public"."ai_usage_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "alert_acknowledgements_alert_id_idx" ON "public"."alert_acknowledgements" USING "btree" ("alert_id");



CREATE INDEX "incident_clusters_cat_time_idx" ON "public"."incident_clusters" USING "btree" ("category", "last_reported_at" DESC);



CREATE INDEX "notifications_recipient_created_idx" ON "public"."notifications" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "report_quality_tokens_user_idx" ON "public"."report_quality_tokens" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "report_strikes_user_time_idx" ON "public"."report_strikes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reports_geo_time_idx" ON "public"."reports" USING "btree" ("category", "created_at" DESC) WHERE ("latitude" IS NOT NULL);



CREATE INDEX "reports_priority_rank_idx" ON "public"."reports" USING "btree" ("priority_rank" DESC, "created_at" DESC);



CREATE OR REPLACE TRIGGER "alert_acknowledgements_updated_at" BEFORE UPDATE ON "public"."alert_acknowledgements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "feedback" AFTER INSERT ON "public"."feedback" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/send-feedback', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "medical_profiles_updated_at" BEFORE UPDATE ON "public"."medical_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "notify-on-insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/send-push', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "on_profile_created" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."upgrade_emergency_contacts"();



CREATE OR REPLACE TRIGGER "on_profile_created_medical" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_medical_profile"();



CREATE OR REPLACE TRIGGER "trg_cluster_report" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."cluster_report"();



CREATE OR REPLACE TRIGGER "trg_record_cluster_confirmation" AFTER UPDATE ON "public"."incident_clusters" FOR EACH ROW EXECUTE FUNCTION "public"."record_cluster_confirmation"();



CREATE OR REPLACE TRIGGER "trg_record_report_submitted" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."record_report_submitted"();



CREATE OR REPLACE TRIGGER "trg_report_quality_gate" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_report_quality_gate"();



ALTER TABLE ONLY "public"."ai_usage_log"
    ADD CONSTRAINT "ai_usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alert_acknowledgements"
    ADD CONSTRAINT "alert_acknowledgements_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_acknowledgements"
    ADD CONSTRAINT "alert_acknowledgements_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_profiles"
    ADD CONSTRAINT "medical_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_flags"
    ADD CONSTRAINT "report_flags_flagger_id_fkey" FOREIGN KEY ("flagger_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_flags"
    ADD CONSTRAINT "report_flags_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_quality_tokens"
    ADD CONSTRAINT "report_quality_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_strikes"
    ADD CONSTRAINT "report_strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "public"."incident_clusters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sos_events"
    ADD CONSTRAINT "sos_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sos_events"
    ADD CONSTRAINT "sos_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE;



CREATE POLICY "Alert owner can read acknowledgements" ON "public"."alert_acknowledgements" FOR SELECT USING ((("auth"."uid"() = "contact_id") OR ("auth"."uid"() = ( SELECT "alerts"."user_id"
   FROM "public"."alerts"
  WHERE ("alerts"."id" = "alert_acknowledgements"."alert_id")))));



CREATE POLICY "Allow anonymous reports" ON "public"."reports" FOR INSERT WITH CHECK (("user_id" IS NULL));



CREATE POLICY "Allow authenticated users to send notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "Allow contacts to delete requests" ON "public"."emergency_contacts" FOR DELETE USING (("auth"."uid"() = "contact_user_id"));



CREATE POLICY "Allow contacts to update their request status" ON "public"."emergency_contacts" FOR UPDATE USING (("auth"."uid"() = "contact_user_id"));



CREATE POLICY "Authenticated users can look up profiles by phone" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Contact can update their own acknowledgement" ON "public"."alert_acknowledgements" FOR UPDATE USING (("auth"."uid"() = "contact_id")) WITH CHECK (("auth"."uid"() = "contact_id"));



CREATE POLICY "Contact can upsert their own acknowledgement" ON "public"."alert_acknowledgements" FOR INSERT WITH CHECK (("auth"."uid"() = "contact_id"));



CREATE POLICY "Contacts can insert events" ON "public"."sos_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."alert_acknowledgements"
  WHERE (("alert_acknowledgements"."alert_id" = "sos_events"."alert_id") AND ("alert_acknowledgements"."contact_id" = "auth"."uid"())))));



CREATE POLICY "Contacts can view alerts" ON "public"."alerts" FOR SELECT USING (("auth"."uid"() IN ( SELECT "emergency_contacts"."contact_user_id"
   FROM "public"."emergency_contacts"
  WHERE ("emergency_contacts"."user_id" = "alerts"."user_id"))));



CREATE POLICY "Contacts can view events for accessible alerts" ON "public"."sos_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."alert_acknowledgements"
  WHERE (("alert_acknowledgements"."alert_id" = "sos_events"."alert_id") AND ("alert_acknowledgements"."contact_id" = "auth"."uid"())))));



CREATE POLICY "Contacts can view reports" ON "public"."reports" FOR SELECT USING (("auth"."uid"() IN ( SELECT "emergency_contacts"."contact_user_id"
   FROM "public"."emergency_contacts"
  WHERE ("emergency_contacts"."user_id" = "reports"."user_id"))));



CREATE POLICY "Manage own alert locations" ON "public"."locations" USING (("auth"."uid"() = ( SELECT "alerts"."user_id"
   FROM "public"."alerts"
  WHERE ("alerts"."id" = "locations"."alert_id"))));



CREATE POLICY "Manage own alerts" ON "public"."alerts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Manage own contacts" ON "public"."emergency_contacts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Manage own reports" ON "public"."reports" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Owners can insert events" ON "public"."sos_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."alerts"
  WHERE (("alerts"."id" = "sos_events"."alert_id") AND ("alerts"."user_id" = "auth"."uid"())))));



CREATE POLICY "Senders can update notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can mark own notifications read" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can send notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can submit feedback" ON "public"."feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view contacts where they are the contact_user_id" ON "public"."emergency_contacts" FOR SELECT USING (("auth"."uid"() = "contact_user_id"));



CREATE POLICY "Users can view events for their own alerts" ON "public"."sos_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."alerts"
  WHERE (("alerts"."id" = "sos_events"."alert_id") AND ("alerts"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users manage own medical profile" ON "public"."medical_profiles" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."ai_usage_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_acknowledgements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_read" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "contact_user_can_delete_link" ON "public"."emergency_contacts" FOR DELETE TO "authenticated" USING ((("contact_user_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "contact_user_can_update_status" ON "public"."emergency_contacts" FOR UPDATE TO "authenticated" USING (("contact_user_id" = "auth"."uid"())) WITH CHECK (("contact_user_id" = "auth"."uid"()));



ALTER TABLE "public"."emergency_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_clusters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "incident_clusters_read" ON "public"."incident_clusters" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medical_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "report_flags_insert_own" ON "public"."report_flags" FOR INSERT TO "authenticated" WITH CHECK (("flagger_id" = "auth"."uid"()));



ALTER TABLE "public"."report_quality_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_strikes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "report_strikes_read_own" ON "public"."report_strikes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sos_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_calls_today"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_calls_today"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cluster_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cluster_report"() TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_settings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."enforce_report_quality_gate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_report_quality_gate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_medical_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_medical_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."haversine_meters"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."haversine_meters"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."haversine_meters"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON FUNCTION "public"."missing_person_gap"("r" "public"."reports") TO "anon";
GRANT ALL ON FUNCTION "public"."missing_person_gap"("r" "public"."reports") TO "authenticated";
GRANT ALL ON FUNCTION "public"."missing_person_gap"("r" "public"."reports") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_cluster_confirmation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_cluster_confirmation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_report_submitted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_report_submitted"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_strike"("p_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_strike"("p_user" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_payload_fingerprint"("p_category" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_payload_fingerprint"("p_category" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."respond_to_contact_request"("p_sender_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_contact_request"("p_sender_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sha256_hex"("p_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sha256_hex"("p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."strike_state"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."strike_state"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upgrade_emergency_contacts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."upgrade_emergency_contacts"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_log" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_log" TO "service_role";



GRANT ALL ON TABLE "public"."alert_acknowledgements" TO "anon";
GRANT ALL ON TABLE "public"."alert_acknowledgements" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_acknowledgements" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_contacts" TO "anon";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."incident_clusters" TO "anon";
GRANT ALL ON TABLE "public"."incident_clusters" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_clusters" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."medical_profiles" TO "anon";
GRANT ALL ON TABLE "public"."medical_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."report_flags" TO "anon";
GRANT ALL ON TABLE "public"."report_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."report_flags" TO "service_role";



GRANT ALL ON TABLE "public"."report_quality_tokens" TO "anon";
GRANT ALL ON TABLE "public"."report_quality_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."report_quality_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."report_strikes" TO "anon";
GRANT ALL ON TABLE "public"."report_strikes" TO "authenticated";
GRANT ALL ON TABLE "public"."report_strikes" TO "service_role";



GRANT ALL ON TABLE "public"."sos_events" TO "anon";
GRANT ALL ON TABLE "public"."sos_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sos_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







