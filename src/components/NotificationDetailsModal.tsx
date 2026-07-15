import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';

interface NotificationDetailsModalProps {
  visible: boolean;
  notification: AppNotification | null;
  onClose: () => void;
  onStatusChange?: () => void;
}

export const NotificationDetailsModal = ({ visible, notification, onClose, onStatusChange }: NotificationDetailsModalProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<{ latitude?: number; longitude?: number; address?: string; details?: string } | null>(null);

  useEffect(() => {
    if (visible && notification) {
      if (notification.type === 'report' || notification.type === 'sos' || notification.type === 'medical' || notification.type === 'police' || notification.type === 'fire') {
        fetchEmergencyDetails();
      }
    }
  }, [visible, notification]);

  const fetchEmergencyDetails = async () => {
    if (!notification) return;
    setLoading(true);
    try {
      if (notification.type === 'report' && notification.report_id) {
        const { data } = await supabase.from('reports').select('latitude, longitude, address, description').eq('id', notification.report_id).single();
        if (data) setDetails({ latitude: data.latitude, longitude: data.longitude, address: data.address, details: data.description });
      } else if (notification.alert_id) {
        const { data } = await supabase.from('alerts').select('latitude, longitude').eq('id', notification.alert_id).single();
        if (data) setDetails({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleAction = async (action: 'accepted' | 'declined' | 'blocked') => {
    if (!notification || notification.type !== 'contact_added') return;
    setLoading(true);
    try {
      // notification.sender_id is the user who added them
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (action === 'declined' || action === 'blocked') {
           // Delete the request
           await supabase.from('emergency_contacts').delete().eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
        } else {
           // Accept request
           await supabase.from('emergency_contacts').update({ status: 'accepted' }).eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
        }
        
        // Delete or mark notification as read
        await supabase.from('notifications').delete().eq('id', notification.id);
        if (onStatusChange) onStatusChange();
        onClose();
      }
    } catch (err) {
      Alert.alert('Error', 'Could not process request');
    }
    setLoading(false);
  };

  const handleViewMap = () => {
    const lat = details?.latitude || notification?.latitude;
    const lng = details?.longitude || notification?.longitude;
    if (lat && lng) {
      onClose();
      router.push(`/map?lat=${lat}&lng=${lng}`);
    } else {
      Alert.alert('Location Unavailable', 'No coordinates were provided with this alert.');
    }
  };

  if (!notification) return null;

  const isContactAdded = notification.type === 'contact_added';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{isContactAdded ? 'Contact Request' : 'Emergency Details'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.senderRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={colors.white} />
              </View>
              <View>
                <Text style={styles.senderName}>{notification.sender_name || 'Someone'}</Text>
                <Text style={styles.notificationTime}>{new Date(notification.created_at).toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.detailsBox}>
              <Text style={styles.notificationBody}>{notification.body}</Text>
              
              {!isContactAdded && loading && (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
              )}
              
              {!isContactAdded && !loading && details && (
                <View style={styles.extraDetails}>
                  {details.address && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={18} color={colors.text.secondary} />
                      <Text style={styles.detailText}>{details.address}</Text>
                    </View>
                  )}
                  {details.details && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text" size={18} color={colors.text.secondary} />
                      <Text style={styles.detailText}>{details.details}</Text>
                    </View>
                  )}
                  {(details.latitude || notification.latitude) ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="compass" size={18} color={colors.text.secondary} />
                      <Text style={styles.detailText}>
                        Lat: {Number(details.latitude || notification.latitude).toFixed(4)}, Lng: {Number(details.longitude || notification.longitude).toFixed(4)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.actions}>
              {isContactAdded ? (
                <>
                  <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleAction('accepted')} disabled={loading}>
                    <Ionicons name="checkmark" size={20} color={colors.white} />
                    <Text style={styles.btnTextLight}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => handleAction('declined')} disabled={loading}>
                    <Ionicons name="close" size={20} color={colors.text.primary} />
                    <Text style={styles.btnTextDark}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.blockBtn]} onPress={() => handleAction('blocked')} disabled={loading}>
                    <Ionicons name="ban" size={20} color={colors.white} />
                    <Text style={styles.btnTextLight}>Block</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[styles.actionBtn, styles.mapBtn, !(details?.latitude || notification?.latitude) && styles.disabledBtn]} onPress={handleViewMap} disabled={!(details?.latitude || notification?.latitude)}>
                  <Ionicons name="map" size={20} color={colors.white} />
                  <Text style={styles.btnTextLight}>View on Map</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: 'bold', color: colors.text.primary },
  closeBtn: { padding: 4 },
  body: { padding: 20 },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  senderName: { fontSize: 16, fontWeight: 'bold', color: colors.text.primary, marginBottom: 4 },
  notificationTime: { fontSize: 12, color: colors.text.secondary },
  detailsBox: { backgroundColor: colors.background, padding: 16, borderRadius: 12, marginBottom: 24 },
  notificationBody: { fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  extraDetails: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { fontSize: 14, color: colors.text.secondary, flex: 1, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  actionBtn: { flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 6 },
  acceptBtn: { backgroundColor: '#00875A' },
  declineBtn: { backgroundColor: colors.border },
  blockBtn: { backgroundColor: '#DC2626' },
  mapBtn: { backgroundColor: colors.primary },
  disabledBtn: { opacity: 0.5 },
  btnTextLight: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  btnTextDark: { color: colors.text.primary, fontWeight: 'bold', fontSize: 15 },
});
