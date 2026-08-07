import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { notifyContactRequestResult, sendPingAck } from '../lib/notifications';

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
  const [details, setDetails] = useState<{ latitude?: number; longitude?: number; address?: string; details?: string; media_paths?: string[] } | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
        const { data } = await supabase.from('reports').select('latitude, longitude, address, description, media_paths').eq('id', notification.report_id).single();
        if (data) setDetails({ latitude: data.latitude, longitude: data.longitude, address: data.address, details: data.description, media_paths: data.media_paths });
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
    if (!notification || notification.type !== 'contact_added' || notification.title !== 'Contact Request' || !notification.sender_id) return;
    setLoading(true);
    try {
      // notification.sender_id is the user who added them
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (action === 'declined' || action === 'blocked') {
           // Delete the request
           await supabase.from('emergency_contacts').delete().eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
           const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
           await notifyContactRequestResult(notification.sender_id, fullName, 'rejected');
        } else {
           // Accept request
           await supabase.from('emergency_contacts').update({ status: 'accepted' }).eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
           const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
           await notifyContactRequestResult(notification.sender_id, fullName, 'accepted');
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

  const handleAcknowledgePing = async () => {
    if (!notification || !notification.sender_id) return;
    setLoading(true);
    try {
      await sendPingAck(notification.sender_id);
      await supabase.from('notifications').delete().eq('id', notification.id);
      if (onStatusChange) onStatusChange();
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Could not send acknowledgement');
    }
    setLoading(false);
  };

  if (!notification) return null;

  const isContactAdded = notification.type === 'contact_added' && notification.title === 'Contact Request';
  const isPing = notification.type === 'ping';
  const isPingAck = notification.type === 'ping_ack';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{isContactAdded ? 'Contact Request' : isPing ? 'Check-in Ping' : isPingAck ? 'Ping Acknowledged' : 'Emergency Details'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
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
              
              {!isContactAdded && !loading && (details?.address || details?.details || (details?.media_paths && details.media_paths.length > 0)) && (
                <View style={styles.extraDetails}>
                  {details?.address && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={18} color={colors.text.secondary} />
                      <Text style={styles.detailText}>{details.address}</Text>
                    </View>
                  )}
                  {details?.details && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text" size={18} color={colors.text.secondary} />
                      <Text style={styles.detailText}>{details.details}</Text>
                    </View>
                  )}
                  {details?.media_paths && details.media_paths.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8 }}>Attached Media</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {details.media_paths.map((uri, index) => (
                          <TouchableOpacity key={index} activeOpacity={0.8} onPress={() => setExpandedImage(uri)}>
                            <Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 8, backgroundColor: colors.border }} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
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
                </>
              ) : isPing ? (
                <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAcknowledgePing} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.white} /> : <Ionicons name="checkmark-circle" size={20} color={colors.white} />}
                  <Text style={styles.btnTextLight}>I'm Safe (Acknowledge)</Text>
                </TouchableOpacity>
              ) : isPingAck ? (
                <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={onClose}>
                  <Text style={styles.btnTextDark}>Dismiss</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 10, width: '100%', flexDirection: 'column' }}>
                  <TouchableOpacity style={[styles.actionBtn, styles.mapBtn, !(details?.latitude || notification?.latitude) && styles.disabledBtn, { flex: 0 }]} onPress={handleViewMap} disabled={!(details?.latitude || notification?.latitude)}>
                    <Ionicons name="map" size={20} color={colors.white} />
                    <Text style={styles.btnTextLight}>View on Map</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>

      <Modal visible={!!expandedImage} transparent={true} animationType="fade" onRequestClose={() => setExpandedImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 1, padding: 10 }} 
            onPress={() => setExpandedImage(null)}
          >
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          {expandedImage && (
            <Image 
              source={{ uri: expandedImage }} 
              style={{ width: '100%', height: '80%', resizeMode: 'contain' }} 
            />
          )}
        </View>
      </Modal>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden', maxHeight: '85%' },
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
