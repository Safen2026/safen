import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Shadows } from '../../constants/Theme';
import { HistoryItem, TYPE_META } from '../../hooks/useHistory';

type Props = {
  item: HistoryItem;
  groupTitle: string;
};

const HistoryCardComponent = ({ item, groupTitle }: Props) => {
  const { colors } = useTheme();
  
  const meta = TYPE_META[item.type] || TYPE_META.other;
  const locationText = item.address || item.description || '';

  // Format time logic extracted for purity
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    if (groupTitle === 'Today') return timeStr;
    if (groupTitle === 'Yesterday' || groupTitle === '2 Days Ago') return `${groupTitle}, ${timeStr}`;
    return timeStr; // For specific dates, we just return time since date is in the group header
  };

  const timeDisplay = formatTime(item.created_at);

  return (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: meta.color }]}>
        {meta.category === 'SOS' ? (
          <Text style={styles.sosIconText}>SOS</Text>
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
          {item.status ? (
            <Text style={[styles.statusText, { color: '#10B981', backgroundColor: '#10B98115' }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
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
});

export const HistoryCard = React.memo(HistoryCardComponent);
HistoryCard.displayName = 'HistoryCard';
