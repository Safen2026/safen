import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface JourneyCardProps {
  /** Called when the user taps "Start a Journey". Wire up Journey Tracking here. */
  onStart?: () => void;
  /** Destination label shown when a journey is active. */
  destination?: string;
  /** Remaining time string shown when a journey is active, e.g. "14 min left". */
  timeLeft?: string;
}

export const JourneyCard = ({ onStart, destination, timeLeft }: JourneyCardProps) => {
  const { colors } = useTheme();
  const isActive = !!destination;

  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: `${isActive ? colors.primary : colors.text.secondary}14` }]}>
        <MaterialCommunityIcons
          name={isActive ? 'navigation' : 'car-outline'}
          size={19}
          color={isActive ? colors.primary : colors.text.secondary}
        />
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          {isActive ? destination : 'No active journey'}
        </Text>
        <Text style={[styles.sub, { color: colors.text.secondary }]}>
          {isActive ? timeLeft ?? 'In progress' : 'Start tracking your route'}
        </Text>
      </View>

      {/* Quiet text-link CTA — intentionally low visual weight */}
      <TouchableOpacity
        onPress={onStart}
        accessibilityLabel={isActive ? 'View journey' : 'Start a Journey'}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.ctaText, { color: isActive ? colors.primary : colors.text.secondary }]}>
          {isActive ? 'View' : 'Start'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Flat row — no card bg, no border, no shadow. Matches WelcomeCard's treatment.
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  sub: {
    fontSize: 12,
  },
  // Text-only CTA — minimal visual footprint
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
