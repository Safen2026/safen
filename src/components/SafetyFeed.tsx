import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

// ─── Types ────────────────────────────────────────────────────────────────────
type FeedSeverity = 'warning' | 'security' | 'medical' | 'fire' | 'info';

interface FeedItem {
  id          : string;
  title       : string;
  description : string;
  time        : string;
  severity    : FeedSeverity;
  icon        : React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

// ─── Severity → visual config ─────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<FeedSeverity, { border: string; icon: string }> = {
  warning  : { border: '#F59E0B', icon: '#F59E0B' },
  security : { border: '#8B5CF6', icon: '#8B5CF6' },
  medical  : { border: '#EF4444', icon: '#EF4444' },
  fire     : { border: '#F97316', icon: '#F97316' },
  info     : { border: '#3B82F6', icon: '#3B82F6' },
};

// ─── Mock data (replaced by backend feed once the AI pipeline is live) ────────
const MOCK_FEED: FeedItem[] = [
  {
    id          : '1',
    title       : 'Roadblock Alert',
    description : 'Reported on Allen Avenue, Ikeja. Heavy traffic expected.',
    time        : '15 mins ago',
    severity    : 'warning',
    icon        : 'alert-rhombus-outline',
  },
  {
    id          : '2',
    title       : 'Suspicious Activity',
    description : 'Unmarked vehicle loitering near Maryland Mall.',
    time        : '1 hour ago',
    severity    : 'security',
    icon        : 'shield-alert-outline',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface SafetyFeedProps {
  /** Live feed items from the backend AI pipeline. Falls back to mock data when empty. */
  items?: FeedItem[];
}

export const SafetyFeed = ({ items }: SafetyFeedProps) => {
  const { colors } = useTheme();
  const feed = items && items.length > 0 ? items : MOCK_FEED;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Recent in your area</Text>

      {feed.map(item => {
        const cfg = SEVERITY_CONFIG[item.severity];
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.7}
            style={[
              styles.card,
              {
                backgroundColor : colors.white,
                borderColor     : colors.border,
                borderLeftColor : cfg.border,
              },
            ]}
            accessibilityLabel={`${item.title}: ${item.description}`}
          >
            <MaterialCommunityIcons
              name={item.icon}
              size={22}
              color={cfg.icon}
              style={styles.icon}
            />
            <View style={styles.content}>
              <Text style={[styles.alertTitle, { color: colors.text.primary }]}>
                {item.title}
              </Text>
              <Text style={[styles.alertDesc, { color: colors.text.secondary }]}>
                {item.description}
              </Text>
              <Text style={[styles.alertTime, { color: colors.text.secondary }]}>
                {item.time}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingTop    : 14,
    paddingHorizontal: 16,
    paddingBottom : 8,
  },
  title: {
    fontSize    : 16,
    fontWeight  : '700',
    marginBottom: 12,
  },
  card: {
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
  icon: {
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  alertTitle: {
    fontSize    : 14,
    fontWeight  : '700',
    marginBottom: 3,
  },
  alertDesc: {
    fontSize    : 13,
    lineHeight  : 18,
    marginBottom: 5,
  },
  alertTime: {
    fontSize: 11,
  },
});
