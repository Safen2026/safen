-- ════════════════════════════════════════════════════════════════════
-- notifications_type_fix
-- Drops the old CHECK constraint on the notifications.type column 
-- and replaces it with a new one that officially supports sos_ack,
-- journey_started, and journey_arrived.
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop any existing CHECK constraint specifically on the 'type' column
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.notifications'::regclass
          AND c.contype = 'c'
          AND a.attname = 'type'
    ) LOOP
        EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END;
$$;

-- Add the new, comprehensive constraint
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (
  type IN (
    'sos', 
    'medical', 
    'police', 
    'fire', 
    'report', 
    'contact_added', 
    'ping', 
    'ping_ack', 
    'check_in_missed', 
    'check_in_reminder', 
    'check_in_deadline', 
    'journey_started', 
    'journey_arrived', 
    'sos_ack'
  )
);
