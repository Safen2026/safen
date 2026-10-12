-- ════════════════════════════════════════════════════════════════════
-- cleanup_duplicate_rls
--
-- Removes redundant / conflicting RLS policies that accumulated from
-- dashboard edits over time. Each table section notes what existed,
-- what is being removed, and what is kept (and why).
--
-- Safe to run more than once: DROP POLICY IF EXISTS is idempotent.
-- ════════════════════════════════════════════════════════════════════


-- ── 1. emergency_contacts ────────────────────────────────────────────
--
-- EXISTING (overlapping) policies:
--   "Manage own contacts"                            ALL  → user_id = uid()
--   "Allow contacts to delete requests"              DELETE → contact_user_id = uid()
--   "contact_user_can_delete_link"                   DELETE → contact_user_id = uid() OR user_id = uid()
--   "Allow contacts to update their request status"  UPDATE → contact_user_id = uid()
--   "contact_user_can_update_status"                 UPDATE → contact_user_id = uid()
--   "Users can view contacts…contact_user_id"        SELECT → contact_user_id = uid()
--
-- KEEP:
--   "Manage own contacts"             covers owner (user_id) for ALL ops
--   "contact_user_can_delete_link"    covers the contact side for DELETE
--   "contact_user_can_update_status"  covers the contact side for UPDATE
--   "Users can view contacts where they are the contact_user_id"  SELECT for contact side
--
-- DROP (fully superseded by the keepers above):
--   "Allow contacts to delete requests"              weaker duplicate of contact_user_can_delete_link
--   "Allow contacts to update their request status"  exact duplicate of contact_user_can_update_status

DROP POLICY IF EXISTS "Allow contacts to delete requests"             ON public.emergency_contacts;
DROP POLICY IF EXISTS "Allow contacts to update their request status" ON public.emergency_contacts;


-- ── 2. notifications ─────────────────────────────────────────────────
--
-- EXISTING (overlapping) INSERT policies:
--   "Allow authenticated users to send notifications"  INSERT sender_id = uid()
--   "Users can send notifications"                     INSERT sender_id = uid()
--
-- Identical logic, different names — leftover from a dashboard rename.
-- Keep the more descriptive name, drop the older one.
--
-- KEEP:  "Users can send notifications"
-- DROP:  "Allow authenticated users to send notifications"

DROP POLICY IF EXISTS "Allow authenticated users to send notifications" ON public.notifications;


-- ── 3. profiles ──────────────────────────────────────────────────────
--
-- EXISTING SELECT policies:
--   "Authenticated users can look up profiles by phone"  SELECT USING (true)  ← wide open
--   "Authenticated users can view all profiles"          SELECT USING (true)  ← wide open, exact duplicate
--   "View own profile"                                   SELECT USING (uid() = id)
--
-- Both wide-open policies let any authenticated user read ANY profile row —
-- including phone numbers, avatar URLs, and full names of people they have
-- no relationship with.
--
-- The correct intent:
--   - A user can always read their own profile.
--   - A user can read profiles of people who are their accepted contacts
--     (needed to show contact names/avatars in the app).
--   - Nobody else's profile should be visible.
--
-- KEEP:  "View own profile"
-- DROP:  both wide-open SELECT policies
-- ADD:   a tighter policy that permits reading profiles of accepted contacts only

DROP POLICY IF EXISTS "Authenticated users can look up profiles by phone" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles"         ON public.profiles;

-- Drop first so this migration is idempotent (safe to re-run).
DROP POLICY IF EXISTS "View profiles of accepted contacts" ON public.profiles;

CREATE POLICY "View profiles of accepted contacts"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Always allow reading your own profile
    auth.uid() = id
    OR
    -- Allow reading a profile if there is an accepted contact relationship in either direction
    EXISTS (
      SELECT 1 FROM public.emergency_contacts ec
      WHERE ec.status = 'accepted'
        AND (
          -- You added this person as your contact
          (ec.user_id = auth.uid() AND ec.contact_user_id = profiles.id)
          OR
          -- This person added you as their contact
          (ec.contact_user_id = auth.uid() AND ec.user_id = profiles.id)
        )
    )
  );
