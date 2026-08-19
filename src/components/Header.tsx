import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Platform, StatusBar as RNStatusBar,
  TouchableOpacity, Image, Modal, ActivityIndicator, ScrollView
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationDetailsModal } from './NotificationDetailsModal';
import { NotificationCard } from './NotificationCard';
import { useNotifications, AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { sendSosAcknowledgement, type SosAckResponse } from '../lib/notifications';

const HeaderComponent = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

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

  const handleSosRespond = useCallback(async (n: AppNotification, response: SosAckResponse) => {
    if (!n.alert_id || !n.sender_id) return;
    
    // Remove it optimistically (or keep it and mark as read? Wait, we probably want to keep it and show what they responded, but removing is fine for now just like contacts)
    // Actually, letting them change their response is a requirement, so DO NOT remove it.
    
    // Mark as read so the dot goes away
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      // It will auto-refresh via realtime hook, but we don't block.
    }
    
    await sendSosAcknowledgement({
      alertId: n.alert_id,
      alertOwnerId: n.sender_id,
      response,
    });
  }, []);

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
            onSosRespond={handleSosRespond}
          />
        ))}
      </View>
    );
  }, [colors, handleAcceptContact, handleDeclineContact, handleSosRespond]);

  return (
    <View style={styles.container}>
      {/* Left: Brand identity */}
      <View style={styles.brandContainer}>
        <Image
          source={require('../../assets/image.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <View style={styles.brandTextGroup}>
          <Text style={styles.brandName}>SAFEN</Text>
          <Text style={styles.brandTagline}>SAFE NIGERIA. ALWAYS.</Text>
        </View>
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
          <SafeAreaView style={styles.notificationsModalFull} edges={['bottom']}>
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
    paddingLeft: 4, // Reduce left padding to pull logo closer to edge
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 2 : 38,
    paddingBottom: 4,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // Left — brand
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0, // completely removed gap
  },
  brandLogo: {
    width: 65,
    height: 65,
    borderRadius: 18,
  },
  brandTextGroup: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginLeft: -6, // negative margin to force it closer past the image bounds
    marginTop: 4, // visually center the text against the logo
  },
  brandName: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 2.2,
    lineHeight: 26,
  },
  brandTagline: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 1.2,
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
  notificationsModalFull: { 
    flex: 1, 
    backgroundColor: colors.background, 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 54 : (RNStatusBar.currentHeight ?? 24) + 10 
  },
  notificationsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  notificationsTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  notificationsSubtitle: { fontSize: 12, color: colors.primary, fontWeight: '500', marginTop: 2 },
  notificationsCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  notificationsEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  notificationsEmptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  notificationsEmptyText: { fontSize: 13, color: colors.text.secondary },
});