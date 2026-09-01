-- 20260824_comprehensive_cascade_delete.sql
-- Fix all missing ON DELETE CASCADE constraints referencing profiles and auth.users
-- Uses IF EXISTS to safely skip any tables that are not deployed to this environment

-- 1. alerts table
ALTER TABLE IF EXISTS public.alerts DROP CONSTRAINT IF EXISTS alerts_user_id_fkey;
ALTER TABLE IF EXISTS public.alerts ADD CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. emergency_contacts table
ALTER TABLE IF EXISTS public.emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_user_id_fkey;
ALTER TABLE IF EXISTS public.emergency_contacts ADD CONSTRAINT emergency_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_contact_user_id_fkey;
ALTER TABLE IF EXISTS public.emergency_contacts ADD CONSTRAINT emergency_contacts_contact_user_id_fkey FOREIGN KEY (contact_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. feedback table
ALTER TABLE IF EXISTS public.feedback DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;
ALTER TABLE IF EXISTS public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. reports table
ALTER TABLE IF EXISTS public.reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;
ALTER TABLE IF EXISTS public.reports ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. sos_events table
ALTER TABLE IF EXISTS public.sos_events DROP CONSTRAINT IF EXISTS sos_events_actor_id_fkey;
ALTER TABLE IF EXISTS public.sos_events ADD CONSTRAINT sos_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 6. alert_acknowledgements table
ALTER TABLE IF EXISTS public.alert_acknowledgements DROP CONSTRAINT IF EXISTS alert_acknowledgements_contact_id_fkey;
ALTER TABLE IF EXISTS public.alert_acknowledgements ADD CONSTRAINT alert_acknowledgements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. notifications table
ALTER TABLE IF EXISTS public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
ALTER TABLE IF EXISTS public.notifications ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.notifications DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;
ALTER TABLE IF EXISTS public.notifications ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
