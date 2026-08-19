import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';
import { Shadows } from '../../constants/Theme';

const PRESET_DURATIONS = [
  { label: '45 min', minutes: 45 },
  { label: '1 hr', minutes: 60 },
  { label: '5 hrs', minutes: 300 },
  { label: '1 day', minutes: 1440 },
];

interface DurationSectionProps {
  isCustomMode: boolean;
  setIsCustomMode: (val: boolean) => void;
  selectedDuration: number;
  setSelectedDuration: (mins: number) => void;
  customMinutes: number;
  adjustCustom: (delta: number) => void;
  formattedDuration: string;
  openPicker: () => void;
  colors: ThemeColors;
}

export const DurationSection = React.memo(({
  isCustomMode,
  setIsCustomMode,
  selectedDuration,
  setSelectedDuration,
  customMinutes,
  adjustCustom,
  formattedDuration,
  openPicker,
  colors,
}: DurationSectionProps) => {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader} accessible={true} accessibilityRole="header">
        <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>EXPECTED DURATION</Text>
        <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>
          {isCustomMode ? `Custom: ${formattedDuration}` : 'Select a preset or custom'}
        </Text>
      </View>

      <View style={styles.durationRow} accessibilityRole="radiogroup" accessibilityLabel="Duration presets">
        {PRESET_DURATIONS.map(opt => {
          const isSelected = !isCustomMode && selectedDuration === opt.minutes;
          return (
            <TouchableOpacity
              key={opt.minutes}
              style={[
                styles.durationCard,
                {
                  backgroundColor: isSelected ? colors.primary : colors.white,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                setIsCustomMode(false);
                setSelectedDuration(opt.minutes);
              }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Preset duration: ${opt.label}`}
            >
              <Text
                style={[
                  styles.durationValue,
                  {
                    color: isSelected ? '#fff' : colors.text.primary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.durationCard,
            {
              backgroundColor: isCustomMode ? colors.primary : colors.white,
              borderColor: isCustomMode ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setIsCustomMode(true)}
          activeOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ checked: isCustomMode }}
          accessibilityLabel="Custom duration"
        >
          <Text
            style={[
              styles.durationValue,
              {
                color: isCustomMode ? '#fff' : colors.text.primary,
                fontWeight: isCustomMode ? '700' : '500',
              },
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {isCustomMode && (
        <View style={[styles.customStepperCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
          <Text style={[styles.customStepperLabel, { color: colors.text.secondary }]} accessibilityRole="header">
            SET YOUR EXACT TIME
          </Text>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: `${colors.text.secondary}15` }]}
              onPress={() => adjustCustom(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decrease duration by 1 minute"
            >
              <Ionicons name="remove" size={20} color={colors.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.stepperValueBox}
              activeOpacity={0.7}
              onPress={openPicker}
              accessibilityRole="button"
              accessibilityLabel={`Current duration: ${formattedDuration}. Tap to pick specific date and time.`}
            >
              <Text style={[styles.stepperBigValue, { color: colors.text.primary }]}>
                {formattedDuration}
              </Text>
              <Text style={[styles.stepperSubtext, { color: colors.text.secondary }]}>
                {customMinutes} minute{customMinutes !== 1 ? 's' : ''} • Tap to pick
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: `${colors.text.secondary}15` }]}
              onPress={() => adjustCustom(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Increase duration by 1 minute"
            >
              <Ionicons name="add" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.quickAddRow}>
            {[15, 60, 1440].map(mins => (
              <TouchableOpacity
                key={mins}
                style={[styles.quickAddChip, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
                onPress={() => adjustCustom(mins)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${mins === 1440 ? '1 day' : mins >= 60 ? '1 hour' : `${mins} minutes`}`}
              >
                <Text style={[styles.quickAddText, { color: colors.primary }]}>
                  +{mins === 1440 ? '1 day' : mins >= 60 ? '1 hr' : `${mins}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
});

DurationSection.displayName = 'DurationSection';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: 11,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  durationCard: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    ...Shadows.sm,
  },
  durationValue: {
    fontSize: 13,
  },
  customStepperCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    ...Shadows.sm,
  },
  customStepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 12,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValueBox: {
    alignItems: 'center',
  },
  stepperBigValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  stepperSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  quickAddRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  quickAddChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickAddText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
