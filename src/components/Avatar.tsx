import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getInitials } from '../utils/stringUtils';
import type { ThemeColors } from '../constants/Theme';
import { Shadows } from '../constants/Theme';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  size?: number;
  isLoading?: boolean;
}

export const Avatar = React.memo(({
  name,
  avatarUrl,
  isOnline = false,
  size = 52,
  isLoading = false,
}: AvatarProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors, size), [colors, size]);

  return (
    <View style={styles.avatarWrap} accessible={true} accessibilityRole="image" accessibilityLabel={`Contact: ${name}`}>
      {isLoading ? (
        <View style={styles.avatarFallback}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={[styles.initials, { color: colors.text.primary }]}>
            {getInitials(name)}
          </Text>
        </View>
      )}
      {isOnline && !isLoading && (
        <View style={styles.onlineDot} accessible={true} accessibilityLabel={`${name} is currently on Safen`} />
      )}
    </View>
  );
});

Avatar.displayName = 'Avatar';

const getStyles = (colors: ThemeColors, size: number) => StyleSheet.create({
  avatarWrap: {
    position: 'relative',
    width: size,
    height: size,
  },
  avatar: {
    width: size,
    height: size,
    borderRadius: size / 2,
  },
  avatarFallback: {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  initials: {
    fontSize: size * 0.28,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: size * 0.02,
    right: size * 0.02,
    width: size * 0.26,
    height: size * 0.26,
    borderRadius: size * 0.13,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: colors.background,
  },
});
