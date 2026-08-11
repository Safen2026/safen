import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface ActiveJourneyTrackerProps {
  destination: string;
  mode: string;
  elapsedStr: string;
  isEnding: boolean;
  onEndJourney: () => void;
  onCancelJourney: () => void;
}

export const ActiveJourneyTracker = ({
  destination,
  mode,
  elapsedStr,
  isEnding,
  onEndJourney,
  onCancelJourney,
}: ActiveJourneyTrackerProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Header — Live badge + elapsed time */}
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.elapsedWrap}>
          <MaterialCommunityIcons name="timer-outline" size={14} color={colors.text.secondary} />
          <Text style={styles.elapsedText}>{elapsedStr}</Text>
        </View>
      </View>

      {/* Journey info row */}
      <View style={styles.infoRow}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
          <MaterialCommunityIcons
            name={
              mode === 'walking' ? 'walk' :
              mode === 'cycling' ? 'bike' :
              mode === 'transit' ? 'bus' : 'car-outline'
            }
            size={22}
            color={colors.primary}
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.label}>Heading to</Text>
          <Text style={styles.destination} numberOfLines={1}>{destination}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={onCancelJourney}
          disabled={isEnding}
        >
          <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.arrivedBtn, { backgroundColor: '#10B981' }, isEnding && { opacity: 0.7 }]}
          onPress={onEndJourney}
          disabled={isEnding}
        >
          {isEnding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
              <Text style={styles.arrivedText}>Arrived Safely</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444415',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  elapsedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  elapsedText: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  destination: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  arrivedBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Shadows.sm,
  },
  arrivedText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
