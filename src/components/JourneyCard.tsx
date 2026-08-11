import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface JourneyCardProps {
  onStart?: () => void;
}

export const JourneyCard = ({ onStart }: JourneyCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onStart}
      activeOpacity={0.8}
    >
      <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
        <MaterialCommunityIcons
          name="navigation-variant-outline"
          size={22}
          color={colors.primary}
        />
      </View>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          Start a Safe Journey
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

const getStyles = (colors: any) => StyleSheet.create({
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
