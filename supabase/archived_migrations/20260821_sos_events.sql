-- Create sos_events table for real-time feed
CREATE TABLE IF NOT EXISTS public.sos_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;

-- Policies

-- Users can read events for their own alerts
CREATE POLICY "Users can view events for their own alerts"
    ON public.sos_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.alerts 
            WHERE alerts.id = sos_events.alert_id 
            AND alerts.user_id = auth.uid()
        )
    );

-- Contacts can read events for alerts they have access to
CREATE POLICY "Contacts can view events for accessible alerts"
    ON public.sos_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.alert_acknowledgements 
            WHERE alert_acknowledgements.alert_id = sos_events.alert_id 
            AND alert_acknowledgements.contact_id = auth.uid()
        )
    );

-- Contacts can insert events
CREATE POLICY "Contacts can insert events"
    ON public.sos_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.alert_acknowledgements 
            WHERE alert_acknowledgements.alert_id = sos_events.alert_id 
            AND alert_acknowledgements.contact_id = auth.uid()
        )
    );

-- The alert owner can also insert events
CREATE POLICY "Owners can insert events"
    ON public.sos_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.alerts 
            WHERE alerts.id = sos_events.alert_id 
            AND alerts.user_id = auth.uid()
        )
    );

-- Setup Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_events;
