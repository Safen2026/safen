import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface ActiveJourneyTrackerProps {
  destination: string;
  mode: string;
  onEndJourney: () => void;
}

export const ActiveJourneyTracker = ({ destination, mode, onEndJourney }: ActiveJourneyTrackerProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.etaText}>
          <Text style={styles.etaTime}>15</Text> min away
        </Text>
      </View>

      <View style={styles.infoRow}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
          <MaterialCommunityIcons 
            name={mode === 'walking' ? 'walk' : 'car-outline'} 
            size={20} 
            color={colors.primary} 
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.label}>Heading to</Text>
          <Text style={styles.destination}>{destination}</Text>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.arrivedBtn, { backgroundColor: '#10B981' }]} 
        onPress={onEndJourney}
      >
        <Text style={styles.arrivedText}>Arrived Safely</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444415',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  etaText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  etaTime: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
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
  label: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  destination: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  arrivedBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  arrivedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
