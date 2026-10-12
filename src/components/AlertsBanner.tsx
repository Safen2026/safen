import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { useSafetyFeed } from '../hooks/useSafetyFeed';

export const AlertsBanner = React.memo(function AlertsBanner() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
  
  const { items, loading } = useSafetyFeed(5);
  
  const alertCount = items.length;
  let subtitle = "Loading alerts...";
  if (!loading) {
    if (alertCount === 0) {
      subtitle = "No new alerts at the moment. Stay safe!";
    } else {
      subtitle = `${alertCount}${alertCount === 5 ? '+' : ''} new alerts in your area.`;
    }
  }

  const handlePress = React.useCallback(() => {
    router.push('/feed');
  }, [router]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`View recent alerts and updates. ${subtitle}`}
      accessibilityHint="Navigates to the full list of security alerts in your area."
    >
      <View style={styles.iconBox}>
        <Ionicons name="notifications" size={20} color="#fff" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Recent Alerts & Updates</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
    </TouchableOpacity>
  );
});

AlertsBanner.displayName = 'AlertsBanner';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white, // surface color
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary, // Red circle
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
