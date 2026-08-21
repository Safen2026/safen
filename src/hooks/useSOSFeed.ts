import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface SOSEvent {
  id: string;
  alert_id: string;
  event_type: string;
  message: string;
  created_at: string;
  actor_id?: string;
  profiles?: {
    full_name: string | null;
  } | null;
}

export function useSOSFeed(alertId: string | null) {
  const [events, setEvents] = useState<SOSEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!alertId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Fetch initial events
    const fetchEvents = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sos_events')
        .select('*, profiles(full_name)')
        .eq('alert_id', alertId)
        .order('created_at', { ascending: true }); // Chronological order

      if (error) {
        console.error('Error fetching SOS events:', error);
      } else if (isMounted && data) {
        setEvents(data as unknown as SOSEvent[]);
      }
      if (isMounted) setLoading(false);
    };

    fetchEvents();

    // Subscribe to new events
    const channel = supabase
      .channel(`sos_events_${alertId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sos_events',
          filter: `alert_id=eq.${alertId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          
          // Fetch the profile info for the new event
          const newEvent = payload.new as SOSEvent;
          if (newEvent.actor_id) {
            const { data, error } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', newEvent.actor_id)
              .single();
            if (error) {
              console.warn('Error fetching actor profile:', error);
            } else if (data) {
              newEvent.profiles = data;
            }
          }
          
          setEvents((prev) => {
            // Prevent duplicates (just in case)
            if (prev.some(e => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn(`Error subscribing to sos_events (status: ${status}):`, err);
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [alertId]);

  return { events, loading };
}
