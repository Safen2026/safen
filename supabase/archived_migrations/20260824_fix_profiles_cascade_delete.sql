-- 20260824_fix_profiles_cascade_delete.sql
-- Adds ON DELETE CASCADE to the notifications table to allow deleting user profiles.

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey,
ADD CONSTRAINT notifications_recipient_id_fkey
    FOREIGN KEY (recipient_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey,
ADD CONSTRAINT notifications_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;
