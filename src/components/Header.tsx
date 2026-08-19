import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Platform, StatusBar as RNStatusBar,
  TouchableOpacity, Image, Modal, ActivityIndicator, ScrollView
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { useSession } from '../context/SessionContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationDetailsModal } from './NotificationDetailsModal';
import { NotificationCard } from './NotificationCard';
import { useNotifications, AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';

const HeaderComponent = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const session = useSession();

  const { notifications, loading: notificationsLoading, unreadCount, markAllRead, removeNotification } = useNotifications();

  // DRY Refactor: Combined accept/reject logic
  const handleContactResponse = useCallback(async (notification: AppNotification, action: 'accepted' | 'declined') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !notification.sender_id) return;
    
    removeNotification(notification.id);
    
    const { error } = await supabase.rpc('respond_to_contact_request', {
      p_sender_id: notification.sender_id,
      p_action: action
    });
    
    if (error) console.warn(`respond_to_contact_request (${action}) failed:`, error.message);
    
    const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
    await supabase.from('notifications').insert({
      recipient_id: notification.sender_id,
      sender_id: user.id,
      sender_name: fullName,
      type: 'contact_added',
      title: action === 'accepted' ? 'Request Accepted' : 'Request Declined',
      body: `${fullName} ${action === 'accepted' ? 'accepted' : 'declined'} your emergency contact request.`
    });
  }, [removeNotification]);

  const handleAcceptContact = useCallback((n: AppNotification) => handleContactResponse(n, 'accepted'), [handleContactResponse]);
  const handleDeclineContact = useCallback((n: AppNotification) => handleContactResponse(n, 'declined'), [handleContactResponse]);

  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  const groupedNotifications = useMemo(() => {
    const groups = {
      today: [] as AppNotification[],
      yesterday: [] as AppNotification[],
      last7Days: [] as AppNotification[],
      last30Days: [] as AppNotification[],
      earlier: [] as AppNotification[]
    };

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
      if (d >= todayDate) groups.today.push(n);
      else if (d >= yesterdayDate) groups.yesterday.push(n);
      else if (d >= sevenDaysAgo) groups.last7Days.push(n);
      else if (d >= thirtyDaysAgo) groups.last30Days.push(n);
      else groups.earlier.push(n);
    });

    return groups;
  }, [notifications]);

  const renderGroup = useCallback((title: string, group: AppNotification[]) => {
    if (group.length === 0) return null;
    return (
      <View key={title} style={{ marginBottom: 12 }}>
        <Text 
          style={{ fontSize: 14, fontWeight: '700', color: colors.text.secondary, marginBottom: 8, marginLeft: 4 }} 
          accessibilityRole="header"
        >
          {title}
        </Text>
        {group.map(n => (
          <NotificationCard 
            key={n.id} 
            notification={n} 
            colors={colors} 
            onAcceptContact={handleAcceptContact}
            onDeclineContact={handleDeclineContact}
            onSelect={setSelectedNotification}
          />
        ))}
      </View>
    );
  }, [colors, handleAcceptContact, handleDeclineContact]);

  return (
    <View style={styles.container}>
      {/* Left: Brand identity */}
      <View style={[styles.brand, { alignItems: 'flex-start' }]}>
        <View style={styles.brandTopRow}>
          <Image
            source={require('../../assets/image.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>SAFEN</Text>
        </View>
        <Text style={[styles.brandTagline, { textAlign: 'left' }]}>SAFE NIGERIA. ALWAYS.</Text>
      </View>

      {/* Right: Actions Group */}
      <View style={styles.rightActionsGroup}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/history')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View history"
        >
          <Ionicons name="time-outline" size={26} color={colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => { setNotificationsVisible(true); markAllRead(); }}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text.primary} />
          {unreadCount > 0 && <View style={styles.badge} />}
        </TouchableOpacity>
      </View>

      {/* Notifications panel */}
      <Modal visible={notificationsVisible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setNotificationsVisible(false)}>
        {notificationsVisible && (
          <SafeAreaView style={styles.notificationsModalFull} edges={['top', 'bottom']}>
            <View style={styles.notificationsHeader}>
              <View accessible={true} accessibilityRole="header">
                <Text style={styles.notificationsTitle}>Notifications</Text>
                {unreadCount > 0 && <Text style={styles.notificationsSubtitle}>{unreadCount} unread</Text>}
              </View>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)} style={styles.notificationsCloseBtn} accessibilityRole="button" accessibilityLabel="Close notifications">
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {notificationsLoading ? (
              <View style={styles.notificationsEmpty} aria-live="polite">
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.notificationsEmpty} aria-live="polite">
                <View style={[styles.emptyIconCircle, { backgroundColor: colors.border }]}>
                  <Ionicons name="notifications-off-outline" size={28} color={colors.text.secondary} />
                </View>
                <Text style={styles.notificationsEmptyTitle}>All caught up!</Text>
                <Text style={styles.notificationsEmptyText}>No new notifications</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {renderGroup('Today', groupedNotifications.today)}
                {renderGroup('Yesterday', groupedNotifications.yesterday)}
                {renderGroup('Last 7 Days', groupedNotifications.last7Days)}
                {renderGroup('Last 30 Days', groupedNotifications.last30Days)}
                {renderGroup('Earlier', groupedNotifications.earlier)}
              </ScrollView>
            )}

          <NotificationDetailsModal
            visible={!!selectedNotification}
            notification={notifications.find(n => n.id === selectedNotification?.id) || selectedNotification}
            onClose={() => setSelectedNotification(null)}
          />
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
};

export const Header = React.memo(HeaderComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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

  // Left — brand
  brand: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginLeft: 12, 
  },
  brandTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 9,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 2.2,
  },
  brandTagline: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'left',
  },

  // Right Actions
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, 
  },
  actionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: `${colors.border}40`, 
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
});