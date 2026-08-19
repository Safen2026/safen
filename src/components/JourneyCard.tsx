import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { Shadows } from '../constants/Theme';

interface JourneyCardProps {
  onStart?: () => void;
  isLoading?: boolean;
}

export const JourneyCardComponent = ({ onStart, isLoading = false }: JourneyCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onStart}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Start a Safe Journey"
      accessibilityHint="Share your live route with contacts"
    >
      <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons
            name="navigation-variant-outline"
            size={22}
            color={colors.primary}
          />
        )}
      </View>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          {isLoading ? 'Starting journey...' : 'Start a Safe Journey'}
        </Text>
        <Text style={[styles.sub, { color: colors.text.secondary }]}>
          Share your live route with contacts
        </Text>
      </View>

      <View style={[styles.actionBadge, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
      </View>
    </TouchableOpacity>
  );
};

export const JourneyCard = React.memo(JourneyCardComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
  },
  actionBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
