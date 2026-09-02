import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '../../src/context/ThemeContext';
import { useSafetyFeed } from '../../src/hooks/useSafetyFeed';
import { FeedEmptyState } from '../../src/components/feed/FeedEmptyState';
import { timeAgo } from '../../src/utils/dateUtils';
import type { FeedSeverity } from '../../src/lib/feed';

const SEVERITY_COLOR: Record<FeedSeverity, string> = {
  critical: '#EF4444',
  warning : '#F97316',
  caution : '#F59E0B',
  info    : '#3B82F6',
};

const FILTERS: ('all' | FeedSeverity)[] = ['all', 'critical', 'warning', 'caution', 'info'];

export default function FeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, refreshing, isNationalOnly, refresh, loadMore } = useSafetyFeed(20);
  const [filter, setFilter] = useState<'all' | FeedSeverity>('all');

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.severity === filter)),
    [items, filter],
  );

  const handleOpen = useCallback((item: (typeof items)[number]) => {
    if (item.deep_link) void Linking.openURL(item.deep_link);
  }, []);

  const renderItem = useCallback(({ item }: { item: (typeof items)[number] }) => {
    const accent = SEVERITY_COLOR[item.severity] ?? SEVERITY_COLOR.info;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleOpen(item)}
        style={[
          styles.card,
          {
            backgroundColor: colors.white,
            borderColor    : colors.border,
            borderLeftColor: accent,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={item.headline}
      >
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{item.headline}</Text>
        <Text style={[styles.cardBody, { color: colors.text.secondary }]}>{item.summary}</Text>
        {item.advice ? (
          <Text style={[styles.advice, { color: accent }]}>{item.advice}</Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.text.secondary }]}>
          {item.kind === 'news' ? item.source_label : 'Safen user report'}
          {' · '}
          {timeAgo(item.occurred_at)}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, handleOpen]);

  const handleLoadMore = useCallback(() => { void loadMore(); }, [loadMore]);
  const handleRefresh = useCallback(() => { void refresh(); }, [refresh]);
  const keyExtractor = useCallback((item: (typeof items)[number]) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Security feed</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.chip,
              {
                borderColor    : filter === f ? colors.status.safeText : colors.border,
                backgroundColor: filter === f ? colors.status.safeBackground : 'transparent',
              },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text.primary }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={keyExtractor}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={<FeedEmptyState nationalOnly={isNationalOnly} />}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        // ── Low-end phone tuning ─────────────────────────────────────
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container   : { flex: 1 },
  header      : {
    flexDirection : 'row',
    alignItems    : 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical  : 12,
  },
  headerTitle : { fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 28 },
  filters     : {
    flexDirection : 'row',
    gap           : 8,
    paddingHorizontal: 16,
    paddingBottom : 12,
    flexWrap      : 'wrap',
  },
  chip        : { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipText    : { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  list        : { paddingHorizontal: 16, paddingBottom: 40 },
  card        : {
    borderWidth    : 1,
    borderLeftWidth: 4,
    borderRadius   : 12,
    padding        : 14,
    marginBottom   : 10,
  },
  cardTitle   : { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardBody    : { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  advice      : { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  meta        : { fontSize: 11 },
});
