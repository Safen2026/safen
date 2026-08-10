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

  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: `${colors.primary}10` }]}>
        <MaterialCommunityIcons
          name="rocket-launch-outline"
          size={19}
          color={colors.primary}
        />
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          Journey Tracking
        </Text>
        <Text style={[styles.sub, { color: colors.text.secondary }]}>
          Live route sharing coming soon!
        </Text>
      </View>

      {/* Quiet text-link CTA */}
      <View hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[styles.ctaText, { color: colors.text.secondary, opacity: 0.6 }]}>
          Soon
        </Text>
      </View>
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
