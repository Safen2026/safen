import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { contactEvents } from '../lib/events';
import { Notifications, isExpoGo } from '../lib/expoNotifications';


export type AppNotification = {
  id: string;
  type: 'sos' | 'medical' | 'police' | 'fire' | 'report' | 'contact_added' | 'ping' | 'ping_ack' | 'check_in_missed' | 'check_in_reminder' | 'check_in_deadline';
  title: string;
  body: string;
  sender_name: string | null;
  sender_id: string | null;
  alert_id: string | null;
  report_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    userIdRef.current = user.id;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data) setNotifications(data);
    setLoading(false);
  }, []);


  // Initial load
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime subscription with reconnection + missed-event recovery
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;

      const handleNewNotification = (payload: RealtimePostgresChangesPayload<AppNotification>) => {
        const row = payload.new as AppNotification;

        // Merge, avoiding duplicates if realtime fires multiple times
        setNotifications(prev => {
          if (payload.eventType === 'UPDATE') {
            return prev.map(n => n.id === row.id ? { ...n, ...row } : n);
          }
          return prev.some(n => n.id === row.id) ? prev : [row, ...prev];
        });

        // Signal contacts screen to refresh when sender gets accept/decline response
        if (row.title === 'Request Accepted' || row.title === 'Request Declined') {
          contactEvents.emitRefresh();
        }

        // Fire local banner when app is in foreground
        if (!isExpoGo && Notifications) {
          Notifications.scheduleNotificationAsync({
            content: {
              title: row.title,
              body: row.body,
              sound: 'default',
              data: { notificationId: row.id, type: row.type },
            },
            trigger: null,
          }).catch(() => {});
        }
      };

      channel = supabase
        .channel(`notifications:user:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          handleNewNotification
        )
        .subscribe((status) => {
          // On every (re)connect, fetch to catch any missed events during the outage
          if (status === 'SUBSCRIBED') {
            fetchNotifications();
          }
        });

      // 30-second polling fallback — catches any edge case realtime misses
      pollTimer = setInterval(() => fetchNotifications(), 30_000);
    })();

    // AppState: re-fetch the moment the app comes back to foreground
    const appStateSub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') fetchNotifications();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (pollTimer) clearInterval(pollTimer);
      appStateSub.remove();
    };
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    if (error) console.warn('markAllRead failed:', error.message);
  }, [notifications]);

  const removeNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) console.warn('removeNotification failed:', error.message);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, loading, unreadCount, refetch: fetchNotifications, markAllRead, removeNotification };
}
