import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification } from '../hooks/useNotifications';
import { timeAgo } from '../utils/dateUtils';
import type { ThemeColors } from '../constants/Theme';
import type { SosAckResponse } from '../lib/notifications';

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
  sos_ack: { icon: 'shield-checkmark', color: '#10B981' },
};

// Pure helper — defined at module level (not inside the component) to avoid
// re-creating the function on every render.
function getResponseMeta(res: SosAckResponse): { label: string; emoji: string } {
  switch (res) {
    case 'on_my_way':            return { label: 'On My Way',   emoji: '🚗' };
    case 'calling_you':          return { label: 'Calling You',  emoji: '📞' };
    case 'alerting_authorities': return { label: 'Calling 112', emoji: '🚨' };
    case 'cant_help':            return { label: "Can't Help",  emoji: '❌' };
  }
}


interface NotificationCardProps {
  notification: AppNotification;
  colors: ThemeColors;
  onAcceptContact: (notification: AppNotification) => void;
  onDeclineContact: (notification: AppNotification) => void;
  onSelect: (notification: AppNotification) => void;
  onSosRespond?: (notification: AppNotification, response: SosAckResponse) => Promise<boolean>;
}

const NotificationCardComponent = ({
  notification: n,
  colors,
  onAcceptContact,
  onDeclineContact,
  onSelect,
  onSosRespond,
}: NotificationCardProps) => {
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [selectedResponse, setSelectedResponse] = useState<SosAckResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSosPress = useCallback(async (res: SosAckResponse) => {
    if (isSubmitting || !onSosRespond) return;
    setSelectedResponse(res);
    setIsSubmitting(true);
    const accepted = await onSosRespond(n, res);
    setIsSubmitting(false);
    // Only collapse to the "Tap to change" summary if the server actually
    // accepted the ack. If it returned false (alert cancelled, not a contact,
    // etc.) we stay expanded so the user isn't misled.
    if (accepted) setIsCollapsed(true);
  }, [isSubmitting, onSosRespond, n]);

  const meta = useMemo(() => {
    let m = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.report;
    if (n.title.includes('sharing their live location') || n.title.includes('is sharing live location')) {
      m = { icon: 'navigate', color: '#6366F1' };
    } else if (n.title.includes('stopped sharing') || n.title.includes('location sharing ended')) {
      m = { icon: 'location-outline', color: '#9CA3AF' };
    } else if (n.title.includes('— On My Way') || n.title.includes('— Calling You') || n.title.includes('— Alerting Authorities') || n.title.includes("— Can't Help")) {
      m = NOTIFICATION_TYPE_META.sos_ack;
    }
    return m;
  }, [n.type, n.title]);

  const isRequest = n.type === 'contact_added' && n.title === 'Contact Request';
  // Show SOS response buttons only for genuine live SOS notifications — not
  // cancellation confirmations (which share the 'sos_ack' type or carry a ✅ prefix).
  const isCancelled = n.title.startsWith('✅');
  const isSos = n.type === 'sos' && !isCancelled && !n.is_community_broadcast;
  // Hide the SOS response buttons if the alert is older than 5 hours
  const isOld = useMemo(
    () => (Date.now() - new Date(n.created_at).getTime()) > 5 * 60 * 60 * 1000,
    [n.created_at],
  );

  const handleAccept = useCallback(() => {
    onAcceptContact(n);
  }, [onAcceptContact, n]);

  const handleDecline = useCallback(() => {
    onDeclineContact(n);
  }, [onDeclineContact, n]);

  const handleSelect = useCallback(() => {
    onSelect(n);
  }, [onSelect, n]);

  const handleExpand = useCallback(() => {
    setIsCollapsed(false);
  }, []);

  const handleSosOnMyWay = useCallback(() => handleSosPress('on_my_way'), [handleSosPress]);
  const handleSosCallingYou = useCallback(() => handleSosPress('calling_you'), [handleSosPress]);
  const handleSosAlertingAuthorities = useCallback(() => handleSosPress('alerting_authorities'), [handleSosPress]);
  const handleSosCantHelp = useCallback(() => handleSosPress('cant_help'), [handleSosPress]);

  return (
    <View style={[styles.notificationCard, !n.is_read && styles.notificationCardUnread]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'flex-start' }}
        onPress={!isRequest ? handleSelect : undefined}
        activeOpacity={!isRequest ? 0.7 : 1}
        disabled={isRequest}
        accessibilityRole={!isRequest ? 'button' : undefined}
        accessibilityHint={!isRequest ? 'Opens notification details' : undefined}
      >
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
      </TouchableOpacity>

      {isRequest && (
        <View style={styles.contactRequestActions}>
          <TouchableOpacity 
            style={styles.acceptBtn} 
            onPress={handleAccept} 
            activeOpacity={0.8} 
            accessibilityRole="button"
            accessibilityLabel={`Accept contact request from ${n.sender_name || 'user'}`}
          >
            <Ionicons name="checkmark" size={15} color="#fff" />
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.declineBtn} 
            onPress={handleDecline} 
            activeOpacity={0.8} 
            accessibilityRole="button"
            accessibilityLabel={`Decline contact request from ${n.sender_name || 'user'}`}
          >
            <Ionicons name="close" size={15} color="#EF4444" />
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {isSos && onSosRespond && !isOld && (
        <View style={styles.sosActionsGrid}>
          {isCollapsed && selectedResponse ? (
            <TouchableOpacity 
              style={[styles.sosActionBtn, styles.sosActionBtnActive, { width: '100%' }]} 
              onPress={handleExpand}
              activeOpacity={0.8}
            >
              <Text style={styles.sosActionEmoji}>{getResponseMeta(selectedResponse).emoji}</Text>
              <Text style={[styles.sosActionText, { color: colors.primary }]}>
                {getResponseMeta(selectedResponse).label} (Tap to change)
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity 
                style={[styles.sosActionBtn, selectedResponse === 'on_my_way' && styles.sosActionBtnActive]} 
                onPress={handleSosOnMyWay} 
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Respond: On my way"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
              >
                {isSubmitting && selectedResponse === 'on_my_way' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.sosActionEmoji}>🚗</Text>
                )}
                <Text style={[styles.sosActionText, selectedResponse === 'on_my_way' && { color: colors.primary }]}>On My Way</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sosActionBtn, selectedResponse === 'calling_you' && styles.sosActionBtnActive]} 
                onPress={handleSosCallingYou} 
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Respond: Calling you"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
              >
                {isSubmitting && selectedResponse === 'calling_you' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.sosActionEmoji}>📞</Text>
                )}
                <Text style={[styles.sosActionText, selectedResponse === 'calling_you' && { color: colors.primary }]}>Calling You</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sosActionBtn, selectedResponse === 'alerting_authorities' && styles.sosActionBtnActive]} 
                onPress={handleSosAlertingAuthorities} 
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Respond: Alerting Authorities"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
              >
                {isSubmitting && selectedResponse === 'alerting_authorities' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.sosActionEmoji}>🚨</Text>
                )}
                <Text style={[styles.sosActionText, selectedResponse === 'alerting_authorities' && { color: colors.primary }]}>Calling 112</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sosActionBtn, selectedResponse === 'cant_help' && styles.sosActionBtnActive]} 
                onPress={handleSosCantHelp} 
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Respond: Can't Help"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
              >
                {isSubmitting && selectedResponse === 'cant_help' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.sosActionEmoji}>❌</Text>
                )}
                <Text style={[styles.sosActionText, selectedResponse === 'cant_help' && { color: colors.primary }]}>Can&apos;t Help</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {!isRequest && !n.is_community_broadcast && (
        <TouchableOpacity 
          style={styles.viewDetailsBtn} 
          onPress={handleSelect} 
          activeOpacity={0.7} 
          accessibilityRole="button"
          accessibilityLabel={`View details for ${n.title}`}
        >
          <Text style={styles.viewDetailsBtnText}>View details</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </TouchableOpacity>
      )}

      {n.is_community_broadcast && (
        <TouchableOpacity
          style={[styles.communityRespondBtn, { backgroundColor: meta.color }]}
          onPress={handleSelect}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View Community Alert and Respond"
        >
          <Ionicons name="shield-checkmark" size={15} color="#fff" />
          <Text style={styles.communityRespondBtnText}>View Alert & Respond</Text>
          <Ionicons name="chevron-forward" size={15} color="#fff" />
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
  viewDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 14 },
  viewDetailsBtnText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  sosActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  sosActionBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.border + '40', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  sosActionBtnActive: { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
  sosActionEmoji: { fontSize: 16 },
  sosActionText: { color: colors.text.primary, fontSize: 12, fontWeight: '600' },
  communityRespondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  communityRespondBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
