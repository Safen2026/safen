import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';
import { useSafetyFeed } from '../hooks/useSafetyFeed';
import { FeedEmptyState } from './feed/FeedEmptyState';
import type { FeedRow, FeedSeverity } from '../lib/feed';
import { timeAgo } from '../utils/dateUtils';

// Severity drives the accent colour; category drives the icon. The previous
// version conflated the two into a single enum.
const SEVERITY_COLOR: Record<FeedSeverity, string> = {
  critical: '#EF4444',
  warning : '#F97316',
  caution : '#F59E0B',
  info    : '#3B82F6',
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const CATEGORY_ICON: Record<string, IconName> = {
  armed_robbery  : 'pistol',
  kidnapping     : 'account-alert-outline',
  banditry       : 'shield-alert-outline',
  unrest_protest : 'bullhorn-outline',
  road_incident  : 'car-emergency',
  fire           : 'fire',
  flood          : 'waves',
  cult_clash     : 'account-group-outline',
  police_activity: 'police-badge-outline',
  fraud_scam     : 'credit-card-off-outline',
  terrorism      : 'alert-octagon-outline',
  herder_farmer  : 'cow',
  other          : 'information-outline',
};

// ─── FeedCard — isolated so React.memo can bail out per item ─────────────────
type FeedCardProps = {
  item: FeedRow;
  onPress: (item: FeedRow) => void;
};

const FeedCard = React.memo(({ item, onPress }: FeedCardProps) => {
  const { colors } = useTheme();
  const accent = SEVERITY_COLOR[item.severity] ?? SEVERITY_COLOR.info;
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[
        styles.card,
        {
          backgroundColor: colors.white,
          borderColor    : colors.border,
          borderLeftColor: accent,
        },
      ]}
      accessibilityLabel={`${item.headline}: ${item.summary}`}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name={CATEGORY_ICON[item.category] ?? 'information-outline'}
        size={22}
        color={accent}
        style={styles.icon}
      />
      <View style={styles.content}>
        <Text style={[styles.alertTitle, { color: colors.text.primary }]}>
          {item.headline}
        </Text>
        <Text style={[styles.alertDesc, { color: colors.text.secondary }]}>
          {item.summary}
        </Text>
        <View style={styles.metaRow}>
          {/* News and community reports must never look alike. */}
          <Text
            style={[
              styles.badge,
              { color: colors.text.secondary, borderColor: colors.border },
            ]}
          >
            {item.kind === 'news' ? item.source_label : 'Safen user report'}
          </Text>
          <Text style={[styles.alertTime, { color: colors.text.secondary }]}>
            {timeAgo(item.occurred_at)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── SafetyFeed ───────────────────────────────────────────────────────────────
interface SafetyFeedProps {
  limit?: number;
  onSeeAll?: () => void;
}

const SafetyFeedComponent = ({ limit = 4, onSeeAll }: SafetyFeedProps) => {
  const { colors } = useTheme();
  const { items, loading, isNationalOnly } = useSafetyFeed(limit);

  // Stable handler: opening a deep-link only depends on the row's URL
  const handleOpen = useCallback((row: FeedRow) => {
    if (row.kind === 'news' && row.deep_link) void Linking.openURL(row.deep_link);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {isNationalOnly ? 'Security updates' : 'Recent in your area'}
        </Text>
        {onSeeAll && items.length > 0 && (
          <TouchableOpacity onPress={onSeeAll} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.status.safeText }]}>See all</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && items.length === 0 && (
        <ActivityIndicator style={styles.loader} color={colors.text.secondary} />
      )}

      {!loading && items.length === 0 && <FeedEmptyState nationalOnly={isNationalOnly} />}

      {items.map((item) => (
        <FeedCard key={item.id} item={item} onPress={handleOpen} />
      ))}
    </View>
  );
};

export const SafetyFeed = React.memo(SafetyFeedComponent);

const styles = StyleSheet.create({
  container : { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8 },
  headerRow : {
    flexDirection : 'row',
    alignItems    : 'center',
    justifyContent: 'space-between',
    marginBottom  : 12,
  },
  title     : { fontSize: 16, fontWeight: '700' },
  seeAll    : { fontSize: 13, fontWeight: '600' },
  loader    : { marginVertical: 20 },
  card      : {
    flexDirection  : 'row',
    alignItems     : 'flex-start',
    borderRadius   : 12,
    borderWidth    : 1,
    borderLeftWidth: 4,
    padding        : 14,
    marginBottom   : 10,
    gap            : 12,
    ...Shadows.sm,
  },
  icon      : { marginTop: 1 },
  content   : { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  alertDesc : { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  metaRow   : { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge     : {
    fontSize         : 10,
    fontWeight       : '700',
    borderWidth      : 1,
    borderRadius     : 4,
    paddingHorizontal: 5,
    paddingVertical  : 1,
    overflow         : 'hidden',
  },
  alertTime : { fontSize: 11 },
});
