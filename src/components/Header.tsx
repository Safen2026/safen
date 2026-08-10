import React, { useContext, useState } from 'react';
import {
  View, Text, StyleSheet, Platform, StatusBar as RNStatusBar,
  TouchableOpacity, Image, Modal, ActivityIndicator, ScrollView
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { SessionContext } from '../context/SessionContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationDetailsModal } from './NotificationDetailsModal';
import { useNotifications, AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';

const NOTIFICATION_TYPE_META: Record<AppNotification['type'], { icon: string; color: string }> = {
  sos: { icon: 'alert-circle', color: '#E02B2B' },
  medical: { icon: 'medkit', color: '#DC2626' },
  police: { icon: 'shield', color: '#2563EB' },
  fire: { icon: 'flame', color: '#EA580C' },
  report: { icon: 'document-text', color: '#7C3AED' },
  contact_added: { icon: 'person-add', color: '#00875A' },
  ping: { icon: 'chatbubbles', color: '#8B5CF6' },
  ping_ack: { icon: 'checkmark-done-circle', color: '#10B981' },
  check_in_missed: { icon: 'alert-circle', color: '#DC2626' },
  check_in_reminder: { icon: 'alarm-outline', color: '#F59E0B' },
  check_in_deadline: { icon: 'warning', color: '#EF4444' },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export const Header = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const session = useContext(SessionContext);

  const { notifications, loading: notificationsLoading, unreadCount, markAllRead, removeNotification } = useNotifications();

  const handleAcceptContact = async (notification: AppNotification) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !notification.sender_id) return;
    removeNotification(notification.id);
    // Use RPC to safely update the sender's contact row (bypasses cross-user RLS)
    const { error } = await supabase.rpc('respond_to_contact_request', {
      p_sender_id: notification.sender_id,
      p_action: 'accepted'
    });
    if (error) console.warn('respond_to_contact_request (accept) failed:', error.message);
    const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
    await supabase.from('notifications').insert({
      recipient_id: notification.sender_id,
      sender_id: user.id,
      sender_name: fullName,
      type: 'contact_added',
      title: 'Request Accepted',
      body: `${fullName} accepted your emergency contact request.`
    });
  };

  const handleRejectContact = async (notification: AppNotification) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !notification.sender_id) return;
    removeNotification(notification.id);
    // Use RPC to safely update the sender's contact row (bypasses cross-user RLS)
    const { error } = await supabase.rpc('respond_to_contact_request', {
      p_sender_id: notification.sender_id,
      p_action: 'declined'
    });
    if (error) console.warn('respond_to_contact_request (decline) failed:', error.message);
    const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
    await supabase.from('notifications').insert({
      recipient_id: notification.sender_id,
      sender_id: user.id,
      sender_name: fullName,
      type: 'contact_added',
      title: 'Request Declined',
      body: `${fullName} declined your emergency contact request.`
    });
  };

  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  return (
    <View style={styles.container}>

      {/* Left: History button */}
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => router.push('/history')}
        activeOpacity={0.7}
        accessibilityLabel="View history"
      >
        <Ionicons name="time-outline" size={24} color={colors.text.primary} />
      </TouchableOpacity>

      {/* Center: Brand identity */}
      <View style={styles.brand}>
        <View style={styles.brandTopRow}>
          <Image
            source={require('../../assets/image.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>SAFEN</Text>
        </View>
        <Text style={styles.brandTagline}>SAFE NIGERIA. ALWAYS.</Text>
      </View>

      {/* Right: Notification bell */}
      <TouchableOpacity
        style={styles.bellBtn}
        activeOpacity={0.7}
        onPress={() => { setNotificationsVisible(true); markAllRead(); }}
        accessibilityLabel="Open notifications"
      >
        <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
        {unreadCount > 0 && <View style={styles.badge} />}
      </TouchableOpacity>

      {/* Notifications panel */}
      <Modal visible={notificationsVisible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setNotificationsVisible(false)}>
        <SafeAreaView style={styles.notificationsModalFull} edges={['top', 'bottom']}>

            {/* Header */}
            <View style={styles.notificationsHeader}>
              <View>
                <Text style={styles.notificationsTitle}>Notifications</Text>
                {unreadCount > 0 && <Text style={styles.notificationsSubtitle}>{unreadCount} unread</Text>}
              </View>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)} style={styles.notificationsCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {notificationsLoading ? (
              <View style={styles.notificationsEmpty}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.notificationsEmpty}>
                <View style={[styles.emptyIconCircle, { backgroundColor: colors.border }]}>
                  <Ionicons name="notifications-off-outline" size={28} color={colors.text.secondary} />
                </View>
                <Text style={styles.notificationsEmptyTitle}>All caught up!</Text>
                <Text style={styles.notificationsEmptyText}>No new notifications</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {(() => {
                  const today: AppNotification[] = [];
                  const yesterday: AppNotification[] = [];
                  const last7Days: AppNotification[] = [];
                  const last30Days: AppNotification[] = [];
                  const earlier: AppNotification[] = [];

                  const now = new Date();
                  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  
                  const yesterdayDate = new Date(todayDate);
                  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

                  const sevenDaysAgo = new Date(todayDate);
                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                  const thirtyDaysAgo = new Date(todayDate);
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                  notifications.forEach(n => {
                    const d = new Date(n.created_at);
                    if (d >= todayDate) today.push(n);
                    else if (d >= yesterdayDate) yesterday.push(n);
                    else if (d >= sevenDaysAgo) last7Days.push(n);
                    else if (d >= thirtyDaysAgo) last30Days.push(n);
                    else earlier.push(n);
                  });

                  const renderCard = (n: AppNotification) => {
                    const meta = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.report;
                    const isRequest = n.type === 'contact_added' && n.title === 'Contact Request';
                    return (
                      <View key={n.id} style={[styles.notificationCard, !n.is_read && styles.notificationCardUnread]}>

                        {/* Top row: icon, text */}
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                          <View style={[styles.notificationIcon, { backgroundColor: meta.color + '18' }]}>
                            <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                          </View>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.notificationTextTitle} numberOfLines={1}>{n.title}</Text>
                            <Text style={styles.notificationTextBody} numberOfLines={2}>{n.body}</Text>
                            <Text style={styles.notificationTime}>{timeAgo(n.created_at)}</Text>
                          </View>
                        </View>

                        {/* Accept / Decline row for contact requests */}
                        {isRequest && (
                          <View style={styles.contactRequestActions}>
                            <TouchableOpacity
                              style={styles.acceptBtn}
                              onPress={() => handleAcceptContact(n)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="checkmark" size={15} color="#fff" />
                              <Text style={styles.acceptBtnText}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.declineBtn}
                              onPress={() => handleRejectContact(n)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="close" size={15} color="#EF4444" />
                              <Text style={styles.declineBtnText}>Decline</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Tap whole card for details (non-request types) */}
                        {!isRequest && (
                          <TouchableOpacity
                            style={styles.viewDetailsBtn}
                            onPress={() => setSelectedNotification(n)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.viewDetailsBtnText}>View details</Text>
                            <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                          </TouchableOpacity>
                        )}

                      </View>
                    );
                  };

                  const renderGroup = (title: string, group: AppNotification[]) => {
                    if (group.length === 0) return null;
                    return (
                      <View key={title} style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.secondary, marginBottom: 8, marginLeft: 4 }}>{title}</Text>
                        {group.map(n => renderCard(n))}
                      </View>
                    );
                  };

                  return (
                    <>
                      {renderGroup('Today', today)}
                      {renderGroup('Yesterday', yesterday)}
                      {renderGroup('Last 7 Days', last7Days)}
                      {renderGroup('Last 30 Days', last30Days)}
                      {renderGroup('Earlier', earlier)}
                    </>
                  );
                })()}
              </ScrollView>
            )}


          <NotificationDetailsModal
            visible={!!selectedNotification}
            notification={notifications.find(n => n.id === selectedNotification?.id) || selectedNotification}
            onClose={() => setSelectedNotification(null)}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 10 : 52,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // Left — hamburger
  menuBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Center — brand
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 2,
  },
  brandTagline: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 1.2,
    marginTop: 2,
    textAlign: 'center',
  },

  // Right — notification bell
  bellBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E02B2B',
    zIndex: 1,
  },
  notificationsModalFull: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 10 },
  notificationsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  notificationsTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  notificationsSubtitle: { fontSize: 12, color: colors.primary, fontWeight: '500', marginTop: 2 },
  notificationsCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  notificationsEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  notificationsEmptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  notificationsEmptyText: { fontSize: 13, color: colors.text.secondary },
  notificationCard: { backgroundColor: colors.background, borderRadius: 12, padding: 12, marginBottom: 8 },
  notificationCardUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  notificationIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  notificationTextTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  notificationTextBody: { fontSize: 13, color: colors.text.secondary, lineHeight: 18, marginBottom: 4 },
  notificationTime: { fontSize: 11, color: colors.text.secondary, opacity: 0.7 },
  notificationDismissBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  contactRequestActions: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#00875A', paddingVertical: 9, borderRadius: 8 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FEE2E2', paddingVertical: 9, borderRadius: 8 },
  declineBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  viewDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 4 },
  viewDetailsBtnText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
});