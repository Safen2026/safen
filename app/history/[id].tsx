import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Linking, Alert, Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/Theme';
import { Shadows } from '../../src/constants/Theme';
import { TYPE_META } from '../../src/hooks/useHistory';
import { getMediaType } from '../../src/utils/mediaUtils';
import { timeAgo } from '../../src/utils/dateUtils';
import { StatusBadge } from '../../src/components/history/StatusBadge';
import { MediaList } from '../../src/components/history/MediaList';
import { SnapshotList } from '../../src/components/history/SnapshotList';

// ─── Types ────────────────────────────────────────────────────────────────────

type HistorySource = 'alert' | 'report';

type DetailData = {
  id: string;
  source: HistorySource;
  type: string;
  status: string | null;
  created_at: string;
  resolved_at: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  address: string | null;
  media_paths: string[];
};


// ─── Duration Helper ──────────────────────────────────────────────────────────

function calcDuration(createdAt: string, resolvedAt: string | null): string | null {
  if (!resolvedAt) return null;
  const diffMs = new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HistoryDetailScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source: HistorySource }>();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // ── Data Fetching ────────────────────────────────────────────────────────────
  // Reuses the same Supabase select pattern as NotificationDetailsModal for DRY code.
  useEffect(() => {
    if (!id || !source) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchDetail = async () => {
      try {
        if (source === 'alert') {
          const { data: row, error } = await supabase
            .from('alerts')
            .select('id, type, status, created_at, resolved_at, latitude, longitude, description, media_paths')
            .eq('id', id)
            .single();

          if (error) console.warn('[HistoryDetail] alert fetch error:', error.message);
          if (isMounted && row) {
            setData({
              id: row.id,
              source: 'alert',
              type: row.type || 'sos',
              status: row.status,
              created_at: row.created_at,
              resolved_at: row.resolved_at ?? null,
              latitude: row.latitude ?? null,
              longitude: row.longitude ?? null,
              description: row.description ?? null,
              address: null,
              media_paths: Array.isArray(row.media_paths) ? row.media_paths : [],
            });
          }
        } else {
          const { data: row, error } = await supabase
            .from('reports')
            .select('id, category, status, created_at, latitude, longitude, description, address, media_paths')
            .eq('id', id)
            .single();

          if (error) console.warn('[HistoryDetail] report fetch error:', error.message);
          if (isMounted && row) {
            setData({
              id: row.id,
              source: 'report',
              type: row.category || 'other',
              status: row.status,
              created_at: row.created_at,
              resolved_at: null, // reports table has no resolved_at column
              latitude: row.latitude ?? null,
              longitude: row.longitude ?? null,
              description: row.description ?? null,
              address: row.address ?? null,
              media_paths: Array.isArray(row.media_paths) ? row.media_paths : [],
            });
          }
        }
      } catch (err) {
        console.error('[HistoryDetail] fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetail();
    return () => { isMounted = false; };
  }, [id, source]);

  // ── Derived State ────────────────────────────────────────────────────────────
  const meta = useMemo(() => TYPE_META[data?.type ?? ''] ?? TYPE_META.other, [data?.type]);

  const { images, videos, audios } = useMemo(() => {
    const imgs: string[] = [];
    const vids: string[] = [];
    const auds: string[] = [];
    (data?.media_paths ?? []).forEach(url => {
      const type = getMediaType(url);
      if (type === 'image') imgs.push(url);
      else if (type === 'video') vids.push(url);
      else auds.push(url);
    });
    return { images: imgs, videos: vids, audios: auds };
  }, [data?.media_paths]);

  const hasMedia = images.length > 0 || videos.length > 0 || audios.length > 0;
  const hasLocation = !!(data?.latitude && data?.longitude);
  const duration = data ? calcDuration(data.created_at, data.resolved_at) : null;

  const formattedDate = useMemo(() => {
    if (!data?.created_at) return '';
    const d = new Date(data.created_at);
    return d.toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [data?.created_at]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Reuses the same map navigation pattern as NotificationDetailsModal.handleViewMap
  const handleViewOnMap = useCallback(() => {
    if (!data?.latitude || !data?.longitude) {
      Alert.alert('Location Unavailable', 'No coordinates were captured for this event.');
      return;
    }
    router.push(`/(tabs)/map?lat=${data.latitude}&lng=${data.longitude}`);
  }, [data?.latitude, data?.longitude]);

  // SECURITY: Validates URL scheme before opening — mirrors NotificationDetailsModal.handleOpenMedia
  const handleOpenMedia = useCallback(async (url: string) => {
    try {
      const lower = url.toLowerCase();
      if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        Alert.alert('Security Alert', 'This media link is not secure and cannot be opened.');
        return;
      }
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
      else Alert.alert('Cannot Open', 'Your device cannot open this file.');
    } catch {
      Alert.alert('Error', 'Failed to open the media file.');
    }
  }, []);

  const handleCloseExpandedImage = useCallback(() => setExpandedImage(null), []);

  // ── Loading State ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centeredFill} aria-live="polite">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty / Error State ──────────────────────────────────────────────────────

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centeredFill}>
          <Ionicons name="warning-outline" size={40} color={colors.text.secondary} />
          <Text style={styles.emptyTitle}>Event Not Found</Text>
          <Text style={styles.emptyBody}>This event may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back to history"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          Event Details
        </Text>
        {/* Spacer to visually centre the title */}
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero Section ──────────────────────────────────────────────────── */}
        <View style={styles.heroSection} accessible={true} accessibilityLabel={`${meta.label} event details`}>
          <View style={[styles.heroIconBox, { backgroundColor: meta.color }]}>
            {meta.category === 'SOS' ? (
              <Text style={styles.heroSosText} adjustsFontSizeToFit numberOfLines={1}>SOS</Text>
            ) : (
              <Ionicons name={meta.icon} size={32} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.heroTitle}>{meta.label}</Text>
          <Text style={styles.heroDate}>{formattedDate}</Text>
          <Text style={styles.heroAgo}>{timeAgo(data.created_at)}</Text>
          <StatusBadge status={data.status} />
        </View>

        {/* ── Event Summary Card ─────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={styles.cardSectionTitle}>Summary</Text>

          {duration && (
            <View style={styles.infoRow} accessible={true} accessibilityLabel={`Duration: ${duration}`}>
              <View style={styles.infoIconBox}>
                <Ionicons name="time-outline" size={16} color={colors.text.secondary} />
              </View>
              <View style={styles.infoTextGroup}>
                <Text style={styles.infoLabel}>Duration</Text>
                <Text style={styles.infoValue}>{duration}</Text>
              </View>
            </View>
          )}

          {data.address ? (
            <View style={styles.infoRow} accessible={true} accessibilityLabel={`Address: ${data.address}`}>
              <View style={styles.infoIconBox}>
                <Ionicons name="location-outline" size={16} color={colors.text.secondary} />
              </View>
              <View style={styles.infoTextGroup}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{data.address}</Text>
              </View>
            </View>
          ) : null}

          {data.description ? (
            <View style={styles.infoRow} accessible={true} accessibilityLabel={`Notes: ${data.description}`}>
              <View style={styles.infoIconBox}>
                <Ionicons name="document-text-outline" size={16} color={colors.text.secondary} />
              </View>
              <View style={styles.infoTextGroup}>
                <Text style={styles.infoLabel}>Notes</Text>
                <Text style={styles.infoValue}>{data.description}</Text>
              </View>
            </View>
          ) : null}

          {hasLocation ? (
            <View style={styles.infoRow} accessible={true} accessibilityLabel="GPS coordinates recorded">
              <View style={styles.infoIconBox}>
                <Ionicons name="navigate-outline" size={16} color={colors.text.secondary} />
              </View>
              <View style={styles.infoTextGroup}>
                <Text style={styles.infoLabel}>GPS</Text>
                <Text style={styles.infoValue}>
                  {data.latitude?.toFixed(5)}, {data.longitude?.toFixed(5)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── View on Map Button ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.mapBtn, !hasLocation && styles.mapBtnDisabled]}
          onPress={handleViewOnMap}
          activeOpacity={0.8}
          disabled={!hasLocation}
          accessibilityRole="button"
          accessibilityLabel={hasLocation ? 'View location on map' : 'No location available'}
          accessibilityHint={hasLocation
            ? 'Opens the map tab with a pin at this event location'
            : 'No coordinates were recorded for this event'}
          accessibilityState={{ disabled: !hasLocation }}
        >
          <Ionicons name="map-outline" size={20} color="#FFFFFF" />
          <Text style={styles.mapBtnText}>
            {hasLocation ? 'View on Map' : 'No Location Available'}
          </Text>
        </TouchableOpacity>

        {/* ── Media / Evidence ──────────────────────────────────────────────── */}
        {hasMedia && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <View style={styles.evidenceHeader}>
              <MaterialCommunityIcons name="shield-search" size={18} color={colors.primary} />
              <Text style={styles.cardSectionTitle}>
                {data.source === 'alert' ? 'Emergency Evidence' : 'Attached Media'}
              </Text>
            </View>

            <MediaList
              items={videos}
              label={`📹 Video (${videos.length})`}
              clipName="Video Clip"
              iconName="videocam"
              color="#2563EB"
              onOpen={handleOpenMedia}
            />
            <MediaList
              items={audios}
              label={`🎙️ Audio (${audios.length} clip${audios.length > 1 ? 's' : ''})`}
              clipName="Audio Clip"
              iconName="mic"
              color="#EA580C"
              onOpen={handleOpenMedia}
            />
            <SnapshotList
              images={images}
              label={`📷 Snapshots (${images.length})`}
              onExpand={setExpandedImage}
            />
          </View>
        )}

      </ScrollView>

      {/* ── Full-screen image viewer ───────────────────────────────────────── */}
      <Modal
        visible={!!expandedImage}
        transparent
        animationType="fade"
        onRequestClose={handleCloseExpandedImage}
        statusBarTranslucent
      >
        <View style={styles.imageViewer}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={handleCloseExpandedImage}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {expandedImage ? (
            <Image
              source={{ uri: expandedImage }}
              style={styles.imageViewerImg}
              resizeMode="contain"
              accessibilityLabel="Full-size snapshot"
            />
          ) : null}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border + '60',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  centeredFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  heroIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...Shadows.md,
  },
  heroSosText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroDate: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  heroAgo: {
    fontSize: 12,
    color: colors.text.secondary,
    opacity: 0.7,
  },



  // Cards
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },

  // Info Rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.border + '60',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoTextGroup: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },

  // Map Button
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    ...Shadows.sm,
  },
  mapBtnDisabled: {
    opacity: 0.4,
  },
  mapBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Evidence Header
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },



  // Image Viewer
  imageViewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  imageViewerImg: {
    width: '100%',
    height: '80%',
  },
});