import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Shadows } from '../../constants/Theme';
import { HistoryItem, TYPE_META } from '../../hooks/useHistory';
import { formatGroupedTime } from '../../utils/dateUtils';
import { getMediaType } from '../../utils/mediaUtils';

type Props = {
  item: HistoryItem;
  groupTitle: string;
  onPress: (item: HistoryItem) => void;
};

// Helper for dynamic status badge colors
const getStatusColors = (status: string | undefined) => {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'active' || s === 'resolved') return { color: '#10B981', bg: '#10B98115' }; // Green
  if (s === 'cancelled') return { color: '#6B7280', bg: '#6B728015' }; // Grey
  if (s === 'pending') return { color: '#F59E0B', bg: '#F59E0B15' }; // Orange
  return { color: '#3B82F6', bg: '#3B82F615' }; // Default Blue
};

const HistoryCardComponent = ({ item, groupTitle, onPress }: Props) => {
  const { colors } = useTheme();
  
  const meta = TYPE_META[item.type] || TYPE_META.other;
  const locationText = item.address || item.description || '';

  const timeDisplay = formatGroupedTime(item.created_at, groupTitle);
  const statusTheme = getStatusColors(item.status);

  // Compute media counts
  const mediaPaths = item.media_paths || [];
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  mediaPaths.forEach(u => {
    const type = getMediaType(u);
    if (type === 'image') imageCount++;
    else if (type === 'video') videoCount++;
    else audioCount++;
  });

  const accessibilityDesc = `${meta.label} on ${timeDisplay}. ${locationText ? `Location: ${locationText}.` : ''} ${item.status ? `Status: ${item.status}.` : ''} ${mediaPaths.length > 0 ? `Has ${mediaPaths.length} attached media files.` : ''}`;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityDesc}
      accessibilityHint="Double-tap to view full event details"
    >
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: meta.color }]} aria-hidden={true}>
        {meta.category === 'SOS' ? (
          <Text 
            style={styles.sosIconText} 
            allowFontScaling={true}
            adjustsFontSizeToFit={true}
            numberOfLines={1}
          >
            SOS
          </Text>
        ) : (
          <Ionicons name={meta.icon} size={24} color="#FFFFFF" />
        )}
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={1}>
            {meta.label}
          </Text>
          <Text style={[styles.cardTime, { color: colors.text.secondary }]}>
            {timeDisplay}
          </Text>
        </View>
        
        {locationText ? (
          <Text style={[styles.cardLocation, { color: colors.text.secondary }]} numberOfLines={1}>
            {locationText}
          </Text>
        ) : null}

        <View style={[styles.cardBottomRow, !locationText && { marginTop: 4 }]}>
          {item.status && statusTheme ? (
            <Text style={[styles.statusText, { color: statusTheme.color, backgroundColor: statusTheme.bg }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          ) : null}

          {/* Media Indicators */}
          {(videoCount > 0 || audioCount > 0 || imageCount > 0) && (
            <View style={styles.mediaIndicators}>
              {videoCount > 0 && (
                <View style={[styles.mediaBadge, { backgroundColor: '#2563EB15' }]}>
                  <Ionicons name="videocam" size={12} color="#2563EB" />
                  <Text style={[styles.mediaBadgeText, { color: '#2563EB' }]}>{videoCount}</Text>
                </View>
              )}
              {audioCount > 0 && (
                <View style={[styles.mediaBadge, { backgroundColor: '#EA580C15' }]}>
                  <Ionicons name="mic" size={12} color="#EA580C" />
                  <Text style={[styles.mediaBadgeText, { color: '#EA580C' }]}>{audioCount}</Text>
                </View>
              )}
              {imageCount > 0 && (
                <View style={[styles.mediaBadge, { backgroundColor: colors.border }]}>
                  <Ionicons name="image" size={12} color={colors.text.secondary} />
                  <Text style={[styles.mediaBadgeText, { color: colors.text.secondary }]}>{imageCount}</Text>
                </View>
              )}
            </View>
          )}

          {/* Tap affordance chevron — always at far right */}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.secondary}
            style={styles.chevron}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    ...Shadows.sm,
    elevation: 3,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  sosIconText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
    letterSpacing: 0.2,
  },
  cardTime: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  cardLocation: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    letterSpacing: 0.3,
  },
  mediaIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 10,
  },
  mediaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  mediaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 'auto' as const,
    opacity: 0.5,
  },
});

const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.status === nextProps.item.status &&
    prevProps.groupTitle === nextProps.groupTitle &&
    prevProps.onPress === nextProps.onPress
  );
};

export const HistoryCard = React.memo(HistoryCardComponent, arePropsEqual);
HistoryCard.displayName = 'HistoryCard';
