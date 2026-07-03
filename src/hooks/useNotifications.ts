import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

export type AppNotification = {
  id: string;
  type: 'sos' | 'medical' | 'police' | 'fire' | 'report' | 'contact_added';
  title: string;
  body: string;
  sender_name: string | null;
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
    setLoading(true);
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

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime: as soon as a row lands in `notifications` for this user,
  // push it into the list immediately (no manual refresh needed) and
  // fire a local banner + sound if the app is currently running
  // (foreground or backgrounded-but-alive). This is separate from real
  // push (see usePushNotifications + the send-push Edge Function),
  // which is what covers the app being fully closed.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as AppNotification;
            setNotifications(prev => [row, ...prev]);

            Notifications.scheduleNotificationAsync({
              content: {
                title: row.title,
                body: row.body,
                sound: 'default',
                data: { notificationId: row.id, type: row.type },
              },
              trigger: null, // fire immediately
            }).catch(() => {});
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (error) console.warn('markAllRead failed:', error.message);
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, loading, unreadCount, refetch: fetchNotifications, markAllRead };
}
