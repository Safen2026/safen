import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, Shadows } from '../../constants/Theme';

export interface PermissionItemConfig {
  key: string;
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  badge: string;
  badgeColor: string;
}

interface PermissionCardProps {
  item: PermissionItemConfig;
  granted: boolean;
  isRequesting: boolean;
  colors: ThemeColors;
  onRequest: (key: string) => void;
  disabled: boolean;
}

export const PermissionCard = React.memo(function PermissionCard({
  item,
  granted,
  isRequesting,
  colors,
  onRequest,
  disabled,
}: PermissionCardProps) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.white,
          borderColor: granted ? '#107C4140' : colors.border,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${item.title} permission card. Status: ${granted ? 'Granted' : 'Not granted'}`}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconBox, { backgroundColor: item.badgeColor + '18' }]}>
          <Ionicons name={item.iconName} size={22} color={item.badgeColor} />
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
              {item.title}
            </Text>
            <View style={[styles.badge, { backgroundColor: item.badgeColor + '15' }]}>
              <Text style={[styles.badgeText, { color: item.badgeColor }]}>
                {item.badge}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
            {item.description}
          </Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        {granted ? (
          <View 
            style={styles.grantedBadge}
            accessibilityRole="text"
            accessibilityLabel={`${item.title} permission granted`}
          >
            <Ionicons name="checkmark-circle" size={18} color="#107C41" />
            <Text style={styles.grantedText}>Enabled</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.grantButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => onRequest(item.key)}
            disabled={disabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Allow access to ${item.title}`}
            accessibilityState={{ disabled }}
          >
            {isRequesting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.grantButtonText, { color: colors.primary }]}>Allow Access</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  cardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grantedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  grantedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#107C41',
  },
  grantButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  grantButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
