import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification } from '../hooks/useNotifications';
import { timeAgo } from '../utils/dateUtils';
import type { ThemeColors } from '../constants/Theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const NOTIFICATION_TYPE_META: Record<string, { icon: IoniconsName; color: string }> = {
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

interface NotificationCardProps {
  notification: AppNotification;
  colors: ThemeColors;
  onAcceptContact: (notification: AppNotification) => void;
  onDeclineContact: (notification: AppNotification) => void;
  onSelect: (notification: AppNotification) => void;
}

const NotificationCardComponent = ({
  notification: n,
  colors,
  onAcceptContact,
  onDeclineContact,
  onSelect,
}: NotificationCardProps) => {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  let meta = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.report;

  // Journey tracking notifications
  if (n.title.includes('started a journey')) {
    meta = { icon: 'map', color: '#10B981' };
  } else if (n.title.includes('arrived safely')) {
    meta = { icon: 'checkmark-circle', color: '#10B981' };
  // Location sharing notifications
  } else if (n.title.includes('sharing their live location') || n.title.includes('is sharing live location')) {
    meta = { icon: 'navigate', color: '#6366F1' };
  } else if (n.title.includes('stopped sharing') || n.title.includes('location sharing ended')) {
    meta = { icon: 'location-outline', color: '#9CA3AF' };
  }

  const isRequest = n.type === 'contact_added' && n.title === 'Contact Request';

  return (
    <View style={[styles.notificationCard, !n.is_read && styles.notificationCardUnread]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[styles.notificationIcon, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View 
          style={{ flex: 1, marginRight: 8 }} 
          accessible={true} 
          accessibilityRole="text" 
          accessibilityLabel={`${n.title}. ${n.body}. ${timeAgo(n.created_at)}`}
        >
          <Text style={styles.notificationTextTitle} numberOfLines={1}>{n.title}</Text>
          <Text style={styles.notificationTextBody} numberOfLines={2}>{n.body}</Text>
          <Text style={styles.notificationTime}>{timeAgo(n.created_at)}</Text>
        </View>
      </View>

      {isRequest && (
        <View style={styles.contactRequestActions}>
          <TouchableOpacity 
            style={styles.acceptBtn} 
            onPress={() => onAcceptContact(n)} 
            activeOpacity={0.8} 
            accessibilityRole="button"
            accessibilityLabel={`Accept contact request from ${n.sender_name || 'user'}`}
          >
            <Ionicons name="checkmark" size={15} color="#fff" />
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.declineBtn} 
            onPress={() => onDeclineContact(n)} 
            activeOpacity={0.8} 
            accessibilityRole="button"
            accessibilityLabel={`Decline contact request from ${n.sender_name || 'user'}`}
          >
            <Ionicons name="close" size={15} color="#EF4444" />
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isRequest && (
        <TouchableOpacity 
          style={styles.viewDetailsBtn} 
          onPress={() => onSelect(n)} 
          activeOpacity={0.7} 
          accessibilityRole="button"
          accessibilityLabel={`View details for ${n.title}`}
        >
          <Text style={styles.viewDetailsBtnText}>View details</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

export const NotificationCard = React.memo(NotificationCardComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  notificationCard: { backgroundColor: colors.background, borderRadius: 12, padding: 12, marginBottom: 8 },
  notificationCardUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  notificationIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  notificationTextTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  notificationTextBody: { fontSize: 13, color: colors.text.secondary, lineHeight: 18, marginBottom: 4 },
  notificationTime: { fontSize: 11, color: colors.text.secondary, opacity: 0.7 },
  contactRequestActions: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#00875A', paddingVertical: 9, borderRadius: 8 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FEE2E2', paddingVertical: 9, borderRadius: 8 },
  declineBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  viewDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 4 },
  viewDetailsBtnText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
});
