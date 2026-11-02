-- ════════════════════════════════════════════════════════════════════════════
-- privacy_location_access_and_retention
--
-- Purpose:
--   1. Allow emergency contacts to read location breadcrumbs for ACTIVE alerts
--      they are linked to (so the SOS map works for contacts).
--   2. Schedule automatic purge of location breadcrumbs older than 90 days
--      (data minimisation -- required for NDPR/GDPR compliance and the
--      Google Play Data Safety "users can delete data" requirement).
--
-- Safe to re-run: all DROP/CREATE are IF NOT EXISTS or IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Allow contacts to read location breadcrumbs for ACTIVE alerts
--
-- Currently public.locations only has "Manage own alert locations" which
-- gates access to the alert owner. Emergency contacts need SELECT access to
-- display the live breadcrumb map during an active SOS, but ONLY for active
-- alerts, and ONLY if the contact relationship is accepted.

DROP POLICY IF EXISTS "Contacts can view active alert locations" ON public.locations;

CREATE POLICY "Contacts can view active alert locations"
  ON public.locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.alerts a
      JOIN public.emergency_contacts ec ON ec.user_id = a.user_id
      WHERE a.id        = locations.alert_id
        AND a.status    = 'active'
        AND ec.contact_user_id = auth.uid()
        AND ec.status   = 'accepted'
    )
  );


-- 2. Auto-purge location breadcrumbs older than 90 days
--
-- Satisfies data minimisation (NDPR Art. 2.1(e)) and allows Play Store
-- Data Safety form to truthfully state location is not stored beyond a
-- reasonable period.
--
-- Requires pg_cron extension (available in Supabase by default).

SELECT cron.schedule(
  'purge-old-location-breadcrumbs',
  '0 3 * * *',
  $$
    DELETE FROM public.locations
    WHERE recorded_at < NOW() - INTERVAL '90 days';
  $$
);
