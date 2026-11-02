-- ════════════════════════════════════════════════════════════════════════════
-- community_responder_improvements
--
-- Purpose:
--   1. Enhance get_community_alert_details() with:
--      • LEFT JOIN on profiles (so alerts without a profile row are never dropped)
--      • audio_url column: returns the latest ambient audio snippet ONLY to confirmed
--        responders or the alert owner while the alert is active.
--   2. Update respond_to_community_alert() to automatically emit an 'responding'
--      event to sos_events so the alert owner sees the responder under LIVE UPDATES.
--   3. Add RLS policies on sos_events and alerts for community responders.
--
-- Safe to re-run: all DROP/CREATE are IF NOT EXISTS or IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Gated details RPC with audio_url & LEFT JOIN ──────────────────────────

DROP FUNCTION IF EXISTS public.get_community_alert_details(uuid);

CREATE OR REPLACE FUNCTION public.get_community_alert_details(p_alert_id uuid)
RETURNS TABLE (
  first_name      text,
  full_name       text,
  latitude        double precision,
  longitude       double precision,
  description     text,
  type            text,
  status          text,
  is_responder    boolean,
  responder_count integer,
  audio_url       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_is_owner     boolean;
  v_is_responder boolean;
BEGIN
  -- Explicit input guard: empty/null UUID returns no rows cleanly
  IF p_alert_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.id = p_alert_id AND a.user_id = v_caller
  ) INTO v_is_owner;

  SELECT EXISTS (
    SELECT 1 FROM public.community_responders cr
    WHERE cr.alert_id     = p_alert_id
      AND cr.responder_id = v_caller
      AND cr.status      != 'cancelled'
  ) INTO v_is_responder;

  RETURN QUERY
  SELECT
    -- First name always visible — humanises the alert
    COALESCE(NULLIF(split_part(pr.full_name, ' ', 1), ''), 'Someone') AS first_name,
    -- Sensitive fields: null for non-responders / non-owners
    CASE WHEN v_is_owner OR v_is_responder THEN pr.full_name    ELSE NULL END AS full_name,
    CASE WHEN v_is_owner OR v_is_responder THEN a.latitude      ELSE round(a.latitude::numeric, 3)::double precision END AS latitude,
    CASE WHEN v_is_owner OR v_is_responder THEN a.longitude     ELSE round(a.longitude::numeric, 3)::double precision END AS longitude,
    CASE WHEN v_is_owner OR v_is_responder THEN a.description   ELSE NULL END AS description,
    a.type,
    a.status,
    v_is_responder                                                     AS is_responder,
    (
      SELECT COUNT(*)::integer
      FROM public.community_responders cr2
      WHERE cr2.alert_id = p_alert_id
        AND cr2.status  != 'cancelled'
    )                                                                  AS responder_count,
    -- Ambient audio URL: strictly gated to owner or active confirmed responder while alert is active
    CASE
      WHEN (v_is_owner OR v_is_responder) AND a.status = 'active' THEN (
        SELECT elem
        FROM unnest(a.media_paths) AS elem
        WHERE elem ILIKE '%audio%'
           OR elem ILIKE '%.m4a%'
           OR elem ILIKE '%.mp3%'
           OR elem ILIKE '%.wav%'
           OR elem ILIKE '%.aac%'
        LIMIT 1
      )
      ELSE NULL
    END AS audio_url
  FROM public.alerts a
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
  WHERE a.id = p_alert_id;
END;
$$;

COMMENT ON FUNCTION public.get_community_alert_details IS
  'Returns alert details gated by respondership. '
  'Exact coords, full name, and audio_url only visible to confirmed responders and owner. '
  'Uses LEFT JOIN on profiles so alerts are never omitted. '
  'audio_url is automatically revoked when alert is cancelled or resolved.';


-- ── 2. respond_to_community_alert: auto-emit sos_events ───────────────────────

CREATE OR REPLACE FUNCTION public.respond_to_community_alert(p_alert_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_status         text;
  v_is_owner       boolean;
  v_responder_name text;
BEGIN
  -- Guard: caller must be authenticated
  IF v_caller IS NULL THEN
    RETURN 'error';
  END IF;

  -- Guard: caller must not be the alert owner
  SELECT EXISTS (
    SELECT 1 FROM public.alerts
    WHERE id = p_alert_id AND user_id = v_caller
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN 'self_respond';
  END IF;

  -- Atomic liveness check + insert in one transaction
  SELECT status INTO v_status
  FROM public.alerts
  WHERE id = p_alert_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN 'alert_inactive';
  END IF;

  -- Upsert: idempotent — re-activates a cancelled response cleanly
  INSERT INTO public.community_responders (alert_id, responder_id, status)
  VALUES (p_alert_id, v_caller, 'on_the_way')
  ON CONFLICT (alert_id, responder_id)
  DO UPDATE SET status = 'on_the_way', responded_at = now();

  -- Fetch responder name for the live feed event
  SELECT full_name INTO v_responder_name
  FROM public.profiles
  WHERE id = v_caller;

  -- Notify the alert owner via sos_events
  INSERT INTO public.sos_events (alert_id, event_type, message, actor_id)
  VALUES (
    p_alert_id,
    'responding',
    COALESCE(v_responder_name, 'A community member') || ' is on the way to help.',
    v_caller
  );

  RETURN 'ok';

EXCEPTION WHEN OTHERS THEN
  RETURN 'error';
END;
$$;


-- ── 3. RLS Policies for Community Responders on sos_events & alerts ──────────

-- Allow community responders to read live updates for alerts they are responding to
DROP POLICY IF EXISTS "Responders can view events for active alerts" ON public.sos_events;
CREATE POLICY "Responders can view events for active alerts"
  ON public.sos_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_responders cr
      WHERE cr.alert_id = sos_events.alert_id
        AND cr.responder_id = auth.uid()
    )
  );

-- Allow community responders to insert updates (e.g. status cancellation)
DROP POLICY IF EXISTS "Responders can insert events" ON public.sos_events;
CREATE POLICY "Responders can insert events"
  ON public.sos_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_responders cr
      WHERE cr.alert_id = sos_events.alert_id
        AND cr.responder_id = auth.uid()
    )
  );

-- Allow confirmed responders to view the active alert row
DROP POLICY IF EXISTS "Responders can view active alerts" ON public.alerts;
CREATE POLICY "Responders can view active alerts"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' AND EXISTS (
      SELECT 1 FROM public.community_responders cr
      WHERE cr.alert_id = alerts.id
        AND cr.responder_id = auth.uid()
        AND cr.status != 'cancelled'
    )
  );
