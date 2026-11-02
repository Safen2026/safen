-- ════════════════════════════════════════════════════════════════════════════
-- fix_alerts_rls_recursion
--
-- Purpose:
--   Break the circular RLS recursion between public.alerts and public.community_responders.
--   When alerts policy checked community_responders, and community_responders policy
--   checked alerts, PostgreSQL threw:
--     ERROR: 42P17: infinite recursion detected in policy for relation "alerts"
--
-- Solution:
--   Use SECURITY DEFINER functions (is_community_responder and is_alert_owner)
--   which bypass RLS during the lookup, eliminating any circular evaluation.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Helper functions with SECURITY DEFINER to bypass RLS recursion
CREATE OR REPLACE FUNCTION public.is_community_responder(p_alert_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_responders
    WHERE alert_id = p_alert_id
      AND responder_id = p_user_id
      AND status != 'cancelled'
  );
$$;

COMMENT ON FUNCTION public.is_community_responder IS
  'Checks if a user is an active confirmed community responder for an alert without triggering RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_alert_owner(p_alert_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alerts
    WHERE id = p_alert_id
      AND user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_alert_owner IS
  'Checks if a user is the owner of an alert without triggering RLS recursion.';

-- 2. Re-create policy on public.alerts using the helper function
DROP POLICY IF EXISTS "Responders can view active alerts" ON public.alerts;
CREATE POLICY "Responders can view active alerts"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' AND public.is_community_responder(id, auth.uid())
  );

-- 3. Re-create policy on public.community_responders using the helper function
DROP POLICY IF EXISTS "Alert owner can view responders for their alert" ON public.community_responders;
CREATE POLICY "Alert owner can view responders for their alert"
  ON public.community_responders
  FOR SELECT
  TO authenticated
  USING (
    public.is_alert_owner(alert_id, auth.uid())
  );

-- 4. Re-create policies on public.sos_events using the helper function
DROP POLICY IF EXISTS "Responders can view events for active alerts" ON public.sos_events;
CREATE POLICY "Responders can view events for active alerts"
  ON public.sos_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_community_responder(alert_id, auth.uid())
  );

DROP POLICY IF EXISTS "Responders can insert events" ON public.sos_events;
CREATE POLICY "Responders can insert events"
  ON public.sos_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_community_responder(alert_id, auth.uid())
  );
