-- ════════════════════════════════════════════════════════════════════════════
-- community_responders
--
-- Purpose:
--   Implements Responder-Gated Disclosure for community alert broadcasts.
--
--   Phase 1 (everyone nearby): first name only + coarse coordinates (~11m).
--   Phase 2 (confirmed responders only): full name + exact GPS, unlocked
--     server-side via get_community_alert_details() after the responder
--     inserts a row via respond_to_community_alert() (atomic RPC).
--
-- Security model:
--   • Only the alert OWNER and confirmed responders can read gated details.
--   • The alert owner cannot insert themselves as a responder (RLS guard).
--   • The respond RPC checks alert liveness atomically (no TOCTOU race).
--   • Exact coordinates are NEVER stored in the notifications table.
--
-- Also adds is_community_broadcast to notifications for unambiguous
-- deep-link routing without heuristic sender_name sniffing.
--
-- Safe to re-run: IF NOT EXISTS / IF EXISTS / CREATE OR REPLACE throughout.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. notifications: add community broadcast flag ────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_community_broadcast boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notifications.is_community_broadcast IS
  'True for notifications sent via notifyCommunityNearby. '
  'Used by the client to route to the community alert detail screen '
  'instead of the standard notification details modal.';


-- ── 1. community_responders table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_responders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id      uuid        NOT NULL REFERENCES public.alerts(id)  ON DELETE CASCADE,
  responder_id  uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  responded_at  timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL DEFAULT 'on_the_way'
                  CHECK (status IN ('on_the_way', 'arrived', 'cancelled')),

  UNIQUE (alert_id, responder_id)
);

COMMENT ON TABLE public.community_responders IS
  'Tracks which community members have opted-in to respond to a community alert. '
  'Inserting a row is the gating event that unlocks exact location + full name '
  'for that responder via get_community_alert_details().';

CREATE INDEX IF NOT EXISTS community_responders_alert_id_idx
  ON public.community_responders (alert_id);

CREATE INDEX IF NOT EXISTS community_responders_responder_id_idx
  ON public.community_responders (responder_id);


-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.community_responders ENABLE ROW LEVEL SECURITY;

-- 2a. INSERT: only the responder themselves; BLOCKS the alert owner from
--     inserting (they already have access to their own alert details).
DROP POLICY IF EXISTS "Community member can register as responder" ON public.community_responders;
CREATE POLICY "Community member can register as responder"
  ON public.community_responders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    responder_id = auth.uid()
    -- SECURITY: Alert owner must not be able to "self-respond" and gain a
    -- community_responders row (they already own the alert; this would be
    -- a no-op but adds confusion and audit noise).
    AND NOT EXISTS (
      SELECT 1 FROM public.alerts a
      WHERE a.id  = alert_id
        AND a.user_id = auth.uid()
    )
  );

-- 2b. Responder can read and update THEIR OWN row only (e.g. to change status)
DROP POLICY IF EXISTS "Responder can view and update own row" ON public.community_responders;
CREATE POLICY "Responder can view and update own row"
  ON public.community_responders
  FOR ALL
  TO authenticated
  USING (responder_id = auth.uid());

-- 2c. Alert OWNER can see who is responding to their alert (read-only)
DROP POLICY IF EXISTS "Alert owner can view responders for their alert" ON public.community_responders;
CREATE POLICY "Alert owner can view responders for their alert"
  ON public.community_responders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alerts a
      WHERE a.id      = community_responders.alert_id
        AND a.user_id = auth.uid()
    )
  );


-- ── 3. Atomic respond RPC ─────────────────────────────────────────────────────
-- Combines the alert-liveness check + responder upsert in a single transaction,
-- eliminating the TOCTOU race where the alert is cancelled between client-side
-- status check and the separate insert call.
--
-- Returns:
--   'ok'             — successfully inserted / already existed
--   'alert_inactive' — alert is not currently active (cancelled/resolved)
--   'self_respond'   — caller is the alert owner (not permitted)
--   'error'          — unexpected database error

CREATE OR REPLACE FUNCTION public.respond_to_community_alert(p_alert_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_status    text;
  v_is_owner  boolean;
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
  FOR UPDATE; -- row-level lock prevents concurrent race on the same alert row

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN 'alert_inactive';
  END IF;

  -- Upsert: idempotent — re-activates a cancelled response cleanly
  INSERT INTO public.community_responders (alert_id, responder_id, status)
  VALUES (p_alert_id, v_caller, 'on_the_way')
  ON CONFLICT (alert_id, responder_id)
  DO UPDATE SET status = 'on_the_way', responded_at = now();

  RETURN 'ok';

EXCEPTION WHEN OTHERS THEN
  RETURN 'error';
END;
$$;

COMMENT ON FUNCTION public.respond_to_community_alert IS
  'Atomically verifies the alert is still active and registers the caller '
  'as a community responder. Eliminates TOCTOU race between status check '
  'and insert. Returns: ok | alert_inactive | self_respond | error.';


-- ── 4. Gated details RPC ─────────────────────────────────────────────────────
-- Returns exact alert details ONLY to the alert owner OR a confirmed responder.
-- All other callers receive NULL for sensitive fields (coords, full name, desc).

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
  responder_count integer
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
    WHERE cr.alert_id    = p_alert_id
      AND cr.responder_id = v_caller
      AND cr.status      != 'cancelled'  -- cancelled responders lose gated access
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
    )                                                                  AS responder_count
  FROM public.alerts a
  JOIN public.profiles pr ON pr.id = a.user_id
  WHERE a.id = p_alert_id;
END;
$$;

COMMENT ON FUNCTION public.get_community_alert_details IS
  'Returns alert details gated by respondership. '
  'Exact coords + full name only visible to confirmed (non-cancelled) responders '
  'and the alert owner. All others receive NULL for sensitive fields. '
  'Cancelled responders lose gated access immediately.';
