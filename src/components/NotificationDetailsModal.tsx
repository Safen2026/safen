import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, Alert, Image, ScrollView, Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { AppNotification } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { notifyContactRequestResult, sendPingAck } from '../lib/notifications';
import { Shadows } from '../constants/Theme';
import { getMediaType } from '../utils/mediaUtils';

interface NotificationDetailsModalProps {
  visible: boolean;
  notification: AppNotification | null;
  onClose: () => void;
  onStatusChange?: () => void;
}

type AlertDetails = {
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  media_paths?: string[] | null;
};

// ─── Sub-Components (DRY & Reusability) ───────────────────────────────────────
type MediaListProps = {
  items: string[];
  label: string;
  clipName: string;
  icon: any;
  color: string;
  onOpen: (url: string) => void;
  styles: any;
};

const MediaList = React.memo(({ items, label, clipName, icon, color, onOpen, styles }: MediaListProps) => {
  if (items.length === 0) return null;
  return (
    <View style={styles.mediaGroup}>
      <Text style={styles.mediaGroupLabel}>{label}</Text>
      <View style={styles.mediaList}>
        {items.map((url, i) => (
          <TouchableOpacity
            key={`${clipName}-${i}`}
            style={styles.mediaFileRow}
            onPress={() => onOpen(url)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Play ${clipName} ${i + 1}`}
          >
            <View style={[styles.mediaFileIcon, { backgroundColor: color + '18' }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <View style={styles.mediaFileInfo}>
              <Text style={styles.mediaFileName}>{clipName} {i + 1}</Text>
              <Text style={styles.mediaFileHint}>Tap to play</Text>
            </View>
            <Ionicons name="play-circle-outline" size={24} color={color} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});
MediaList.displayName = 'MediaList';

type SnapshotListProps = {
  images: string[];
  label: string;
  onExpand: (url: string) => void;
  styles: any;
};

const SnapshotList = React.memo(({ images, label, onExpand, styles }: SnapshotListProps) => {
  if (images.length === 0) return null;
  return (
    <View style={styles.mediaGroup}>
      <Text style={styles.mediaGroupLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
        {images.map((uri, i) => (
          <TouchableOpacity
            key={`img-${i}`}
            activeOpacity={0.8}
            onPress={() => onExpand(uri)}
            accessibilityRole="button"
            accessibilityLabel={`View image ${i + 1}`}
          >
            <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});
SnapshotList.displayName = 'SnapshotList';


// ─── Main Component ───────────────────────────────────────────────────────────
const NotificationDetailsModalComponent = ({
  visible, notification, onClose, onStatusChange,
}: NotificationDetailsModalProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [details, setDetails] = useState<AlertDetails | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const notificationRef = useRef(notification);
  notificationRef.current = notification;

  const isEmergencyAlert =
    notification?.type === 'sos' ||
    notification?.type === 'medical' ||
    notification?.type === 'police' ||
    notification?.type === 'fire';

  const doFetch = useCallback(async (notif: AppNotification, isRefresh: boolean) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      let fetched: AlertDetails | null = null;

      if (notif.type === 'report' && notif.report_id) {
        const { data, error } = await supabase
          .from('reports')
          .select('latitude, longitude, address, description, media_paths')
          .eq('id', notif.report_id)
          .limit(1);
        if (error) console.warn('[Modal] report fetch error:', error.message);
        if (data && data.length > 0) {
          const row = data[0];
          fetched = {
            latitude: row.latitude,
            longitude: row.longitude,
            description: row.address
              ? `${row.address}${row.description ? '\n' + row.description : ''}`
              : row.description,
            media_paths: row.media_paths,
          };
        }
      } else if (notif.alert_id) {
        const { data, error } = await supabase
          .from('alerts')
          .select('latitude, longitude, description, media_paths')
          .eq('id', notif.alert_id)
          .limit(1);
        if (error) console.warn('[Modal] alert fetch error:', error.message);
        if (data && data.length > 0) {
          const row = data[0];
          fetched = {
            latitude: row.latitude,
            longitude: row.longitude,
            description: row.description,
            media_paths: row.media_paths,
          };
        }
      }

      setDetails(fetched);
    } catch (err) {
      console.error('[Modal] fetchEmergencyDetails error:', err);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !notification) return;
    setDetails(null);
    const needsFetch =
      notification.type === 'sos' ||
      notification.type === 'medical' ||
      notification.type === 'police' ||
      notification.type === 'fire' ||
      notification.type === 'report';
    if (needsFetch) {
      doFetch(notification, false);
    }
  }, [visible, notification?.id, doFetch]); 

  const handleRefresh = useCallback(() => {
    if (notificationRef.current) doFetch(notificationRef.current, true);
  }, [doFetch]);

  const handleAction = useCallback(async (action: 'accepted' | 'declined') => {
    if (!notification || notification.type !== 'contact_added' || !notification.sender_id) return;
    // Accept/decline any contact_added notification where we have a sender — not just those titled 'Contact Request'
    // The 'Contact Request' title comes from sendContactRequest(); notifyContactAdded() uses a different title but same action.
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (action === 'declined') {
          await supabase.from('emergency_contacts').delete().eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
          const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
          await notifyContactRequestResult(notification.sender_id, fullName, 'rejected');
        } else {
          await supabase.from('emergency_contacts').update({ status: 'accepted' }).eq('user_id', notification.sender_id).eq('contact_user_id', user.id);
          const fullName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A user';
          await notifyContactRequestResult(notification.sender_id, fullName, 'accepted');
        }
        await supabase.from('notifications').delete().eq('id', notification.id);
        onStatusChange?.();
        onClose();
      }
    } catch {
      Alert.alert('Error', 'Could not process request');
    }
    setLoading(false);
  }, [notification, onClose, onStatusChange]);

  const handleViewMap = useCallback(() => {
    const lat = details?.latitude ?? notification?.latitude;
    const lng = details?.longitude ?? notification?.longitude;
    const senderName = notification?.sender_name;
    if (lat && lng) {
      onClose();
      const params = new URLSearchParams();
      params.append('lat', lat.toString());
      params.append('lng', lng.toString());
      if (senderName) params.append('senderName', senderName);
      if (notification?.type) params.append('alertType', notification.type);
      if (notification?.title) params.append('alertTitle', notification.title);
      router.push(`/map?${params.toString()}`);
    } else {
      Alert.alert('Location Unavailable', 'No coordinates were attached to this alert.');
    }
  }, [details?.latitude, details?.longitude, notification?.latitude, notification?.longitude, notification?.sender_name, onClose]);

  const handleAcknowledgePing = useCallback(async () => {
    if (!notification || !notification.sender_id) return;
    setLoading(true);
    try {
      await sendPingAck(notification.sender_id);
      await supabase.from('notifications').delete().eq('id', notification.id);
      onStatusChange?.();
      onClose();
    } catch {
      Alert.alert('Error', 'Could not send acknowledgement');
    }
    setLoading(false);
  }, [notification, onClose, onStatusChange]);

  const handleOpenMedia = useCallback(async (url: string) => {
    try {
      // SECURITY FIX: Prevent malicious deep links (e.g. javascript:, file:)
      const lowerUrl = url.toLowerCase();
      if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
        Alert.alert('Security Alert', 'This media link is not secure and cannot be opened.');
        return;
      }
      
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
      else Alert.alert('Cannot Open', 'Your device cannot open this media file.');
    } catch {
      Alert.alert('Error', 'Failed to open the media file.');
    }
  }, []);

  // Performance Fix: Memoize heavy media filtering
  const { images, videos, audios } = useMemo(() => {
    const mediaPaths = details?.media_paths ?? [];
    const imgs: string[] = [];
    const vids: string[] = [];
    const auds: string[] = [];
    mediaPaths.forEach(u => {
      const type = getMediaType(u);
      if (type === 'image') imgs.push(u);
      else if (type === 'video') vids.push(u);
      else auds.push(u);
    });
    return { images: imgs, videos: vids, audios: auds };
  }, [details?.media_paths]);

  if (!notification) return null;

  const isContactAdded = notification.type === 'contact_added' && !!notification.sender_id;
  const isPing = notification.type === 'ping';
  const isPingAck = notification.type === 'ping_ack';
  const isCheckInMissed = notification.type === 'check_in_missed';

  const hasLocation = !!(details?.latitude ?? notification?.latitude);
  const hasEvidence = images.length > 0 || videos.length > 0 || audios.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent} accessibilityRole="alert" aria-live="polite">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isContactAdded ? 'Contact Request' : isPing ? 'Check-in Ping' : isPingAck ? 'Ping Acknowledged' : 'Emergency Details'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close modal">
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false} showsVerticalScrollIndicator={false}>
            {/* Sender */}
            <View style={styles.senderRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.senderName} numberOfLines={1}>{notification.sender_name || 'Someone'}</Text>
                <Text style={styles.notificationTime}>{new Date(notification.created_at).toLocaleString()}</Text>
              </View>
            </View>

            {/* Notification body */}
            <View style={styles.detailsBox}>
              <Text style={styles.notificationBody}>{notification.body}</Text>

              {!isContactAdded && !isPing && !isPingAck && loading && (
                <View style={styles.loadingRow} aria-live="polite">
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.loadingText}>Loading details…</Text>
                </View>
              )}

              {/* Extra context from alert/report */}
              {!isContactAdded && !isPing && !isPingAck && !loading && details?.description && (
                <View style={[styles.detailRow, { marginTop: 14 }]}>
                  <Ionicons name="document-text-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.detailText}>{details.description}</Text>
                </View>
              )}
            </View>

            {/* ── Evidence section (SOS / Emergency only) ── */}
            {isEmergencyAlert && !loading && (
              <View style={styles.evidenceSection}>
                <View style={styles.evidenceHeader}>
                  <View style={styles.evidenceTitleRow}>
                    <MaterialCommunityIcons name="shield-search" size={18} color={colors.primary} />
                    <Text style={styles.evidenceTitle}>Emergency Evidence</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.refreshBtn, refreshing && styles.refreshingBtn]}
                    onPress={handleRefresh}
                    disabled={refreshing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh evidence"
                    aria-busy={refreshing}
                  >
                    {refreshing
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <>
                          <Ionicons name="refresh" size={14} color={colors.primary} />
                          <Text style={styles.refreshBtnText}>Refresh</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>

                {!hasEvidence && !refreshing && (
                  <View style={styles.noEvidenceBox} aria-live="polite">
                    <MaterialCommunityIcons name="clock-outline" size={28} color={colors.text.secondary} />
                    <Text style={styles.noEvidenceTitle}>Evidence uploading…</Text>
                    <Text style={styles.noEvidenceBody}>
                      Audio and video are recorded and uploaded in real-time chunks. Tap Refresh to check for new uploads.
                    </Text>
                  </View>
                )}

                <MediaList items={videos} label={`📹 Video (${videos.length})`} clipName="Video Clip" icon="videocam" color="#2563EB" onOpen={handleOpenMedia} styles={styles} />
                <MediaList items={audios} label={`🎙️ Audio (${audios.length} clip${audios.length > 1 ? 's' : ''})`} clipName="Audio Clip" icon="mic" color="#EA580C" onOpen={handleOpenMedia} styles={styles} />
                <SnapshotList images={images} label={`📷 Snapshots (${images.length})`} onExpand={setExpandedImage} styles={styles} />
              </View>
            )}

            {/* Report media */}
            {/* Report media */}
            {notification.type === 'report' && !loading && images.length > 0 && (
              <SnapshotList images={images} label="📎 Attached Media" onExpand={setExpandedImage} styles={styles} />
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {isContactAdded ? (
                <>
                  <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleAction('accepted')} disabled={loading} accessibilityRole="button">
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.btnTextLight}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => handleAction('declined')} disabled={loading} accessibilityRole="button">
                    <Ionicons name="close" size={20} color={colors.text.primary} />
                    <Text style={styles.btnTextDark}>Decline</Text>
                  </TouchableOpacity>
                </>
              ) : isPing ? (
                <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAcknowledgePing} disabled={loading} accessibilityRole="button">
                  {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  <Text style={styles.btnTextLight}>I'm Safe</Text>
                </TouchableOpacity>
              ) : isPingAck ? (
                <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={onClose} accessibilityRole="button">
                  <Text style={styles.btnTextDark}>Dismiss</Text>
                </TouchableOpacity>
              ) : isCheckInMissed ? (
                <>
                  {hasLocation && (
                    <TouchableOpacity style={[styles.actionBtn, styles.mapBtn]} onPress={handleViewMap} accessibilityRole="button">
                      <Ionicons name="map" size={20} color="#fff" />
                      <Text style={styles.btnTextLight}>View on Map</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={onClose} accessibilityRole="button">
                    <Text style={styles.btnTextDark}>Dismiss</Text>
                  </TouchableOpacity>
                </>

              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.mapBtn, !hasLocation && styles.disabledBtn]}
                  onPress={handleViewMap}
                  disabled={!hasLocation}
                  accessibilityRole="button"
                >
                  <Ionicons name="map" size={20} color="#fff" />
                  <Text style={styles.btnTextLight}>View on Map</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Full-screen image viewer */}
      <Modal visible={!!expandedImage} transparent animationType="fade" onRequestClose={() => setExpandedImage(null)}>
        <View style={styles.imageViewer}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setExpandedImage(null)} accessibilityRole="button" accessibilityLabel="Close image">
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {expandedImage ? <Image source={{ uri: expandedImage }} style={styles.imageViewerImg} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </Modal>
  );
};

export const NotificationDetailsModal = React.memo(NotificationDetailsModalComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden', maxHeight: '90%', ...Shadows.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  closeBtn: { padding: 4 },
  body: { flexShrink: 1 },
  bodyContent: { padding: 20, paddingBottom: 28 },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  senderName: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 2 },
  notificationTime: { fontSize: 12, color: colors.text.secondary },
  detailsBox: { backgroundColor: colors.background, padding: 16, borderRadius: 14, marginBottom: 16 },
  notificationBody: { fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  loadingText: { fontSize: 13, color: colors.text.secondary },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { fontSize: 13, color: colors.text.secondary, flex: 1, lineHeight: 18 },

  // Evidence section
  evidenceSection: { marginBottom: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  evidenceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evidenceTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.primary + '60', backgroundColor: colors.primary + '0D', minWidth: 80, justifyContent: 'center' },
  refreshingBtn: { opacity: 0.7 },
  refreshBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  noEvidenceBox: { alignItems: 'center', padding: 24, gap: 8 },
  noEvidenceTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  noEvidenceBody: { fontSize: 13, color: colors.text.secondary, textAlign: 'center', lineHeight: 18 },

  // Media
  mediaGroup: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border + '80' },
  mediaGroupLabel: { fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 10 },
  mediaList: { gap: 8 },
  mediaFileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.background, borderRadius: 10, padding: 12 },
  mediaFileIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  mediaFileInfo: { flex: 1 },
  mediaFileName: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  mediaFileHint: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  imageRow: { gap: 8 },
  thumbnail: { width: 112, height: 112, borderRadius: 10, backgroundColor: colors.border },

  // Actions
  actions: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  actionBtn: { flex: 1, flexDirection: 'row', paddingVertical: 13, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 6 },
  acceptBtn: { backgroundColor: '#00875A' },
  declineBtn: { backgroundColor: colors.border },
  mapBtn: { backgroundColor: colors.primary },
  disabledBtn: { opacity: 0.45 },
  btnTextLight: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnTextDark: { color: colors.text.primary, fontWeight: '700', fontSize: 15 },

  // Image viewer
  imageViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 44, right: 20, zIndex: 10, padding: 8 },
  imageViewerImg: { width: '100%', height: '80%' },
});
