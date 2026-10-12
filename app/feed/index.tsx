import React, { useCallback, Component, ErrorInfo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useTheme } from '../../src/context/ThemeContext';
import { useSafetyFeed } from '../../src/hooks/useSafetyFeed';
import { FeedEmptyState } from '../../src/components/feed/FeedEmptyState';
import { timeAgo } from '../../src/utils/dateUtils';
import { Shadows } from '../../src/constants/Theme';
import type { FeedRow, FeedSeverity } from '../../src/lib/feed';

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
        {item.advice ? (
          <Text style={[styles.advice, { color: accent }]}>{item.advice}</Text>
        ) : null}
        <View style={styles.metaRow}>
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

class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FeedScreen Crash:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff'}}>
          <Text style={{color: 'red', fontSize: 18, fontWeight: 'bold', marginBottom: 10}}>Feed Screen Crashed</Text>
          <Text style={{color: '#333', textAlign: 'center'}}>{this.state.error?.message || 'Unknown Error'}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function FeedScreenContent() {
  const { colors } = useTheme();
  const router = useRouter();
  // We use the exact same hook as before, but with a larger limit for the dedicated screen
  const { items, loading, isNationalOnly } = useSafetyFeed(20);

  const handleOpen = useCallback((row: FeedRow) => {
    if (row.deep_link) void Linking.openURL(row.deep_link);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          {isNationalOnly ? 'Security updates' : 'Recent in your area'}
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && items.length === 0 && (
          <ActivityIndicator style={styles.loader} color={colors.text.secondary} />
        )}

        {!loading && items.length === 0 && (
          <FeedEmptyState nationalOnly={isNationalOnly} />
        )}

        {items.map((item) => (
          <FeedCard key={item.id} item={item} onPress={handleOpen} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50, // Hardcoded top padding to avoid SafeAreaInsets crash
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  spacer: {
    width: 36,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loader: {
    marginVertical: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
    gap: 12,
    ...Shadows.sm,
  },
  icon: {
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  alertDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  advice: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  alertTime: {
    fontSize: 12,
  },
});

export default function FeedScreen() {
  return (
    <ErrorBoundary>
      <FeedScreenContent />
    </ErrorBoundary>
  );
}
