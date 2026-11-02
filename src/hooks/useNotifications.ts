import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { AppState } from 'react-native';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { contactEvents } from '../lib/events';
import { Notifications, isExpoGo } from '../lib/expoNotifications';


export type AppNotification = {
  id: string;
  type: 'sos' | 'medical' | 'police' | 'fire' | 'report'
       | 'contact_added' | 'ping' | 'ping_ack'
       | 'check_in_missed' | 'check_in_reminder' | 'check_in_deadline'
       | 'sos_ack';
  title: string;
  body: string;
  sender_name: string | null;
  sender_id: string | null;
  alert_id: string | null;
  report_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_read: boolean;
  is_community_broadcast: boolean;
  created_at: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    // getSession() reads from local cache — never makes a network round-trip.
    // getUser() contacts the Auth server on every call, which hammers the network
    // when called from a 30s poll + AppState listener simultaneously.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    let isMounted = true;

    function setupChannel(userId: string) {
      // Remove previous channel before creating a new one
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
        channel = null;
      }

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

        // Fire local banner only for new incoming notifications — not for
        // UPDATE events (e.g. is_read changes), which have no new information.
        if (payload.eventType === 'INSERT' && !isExpoGo && Notifications) {
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
        .channel(`notifications:user:${userId}:${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          handleNewNotification
        )
        .on(
          'postgres_changes',
          {
            // Handles is_read changes (e.g. markAllRead confirmed by server,
            // or a future multi-device read-sync). Banner does NOT fire for
            // UPDATE — see the eventType guard in handleNewNotification.
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          handleNewNotification
        )
        .subscribe((status) => {
          // On every (re)connect, fetch to catch any missed events during the outage
          if (status === 'SUBSCRIBED') {
            fetchNotifications();
          }
        });
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      const user = session?.user;
      if (!user) return;
      userIdRef.current = user.id;

      setupChannel(user.id);

      // 8-second polling fallback — ensures near-real-time coverage even if
      // Supabase Realtime misses an event (e.g. network blip, subscription lag).
      pollTimer = setInterval(() => fetchNotifications(), 8_000);
    })();

    // Re-subscribe when auth state changes (sign-in after app open)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const userId = session?.user?.id;
      if (userId) {
        userIdRef.current = userId;
        setupChannel(userId);
        fetchNotifications();
      }
    });

    // AppState: re-fetch the moment the app comes back to foreground
    const appStateSub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') fetchNotifications();
    });

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      if (pollTimer) clearInterval(pollTimer);
      authListener.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, [fetchNotifications]);

  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const markAllRead = useCallback(async () => {
    const unreadIds = notificationsRef.current.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    if (error) console.warn('markAllRead failed:', error.message);
  }, []);

  const removeNotification = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) console.warn('removeNotification failed:', error.message);
  }, []);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  return useMemo(() => ({
    notifications,
    loading,
    unreadCount,
    refetch: fetchNotifications,
    markAllRead,
    removeNotification,
  }), [notifications, loading, unreadCount, fetchNotifications, markAllRead, removeNotification]);
}
