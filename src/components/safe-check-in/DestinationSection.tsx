import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';
import { Shadows } from '../../constants/Theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const DESTINATION_PRESETS: { label: string; icon: IoniconsName }[] = [
  { label: 'Home', icon: 'home-outline' },
  { label: 'Work', icon: 'briefcase-outline' },
  { label: 'Gym', icon: 'barbell-outline' },
  { label: 'Airport', icon: 'airplane-outline' },
];

interface DestinationSectionProps {
  destination: string;
  setDestination: (dest: string) => void;
  colors: ThemeColors;
}

export const DestinationSection = React.memo(({
  destination,
  setDestination,
  colors,
}: DestinationSectionProps) => {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader} accessible={true} accessibilityRole="header">
        <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>WHERE ARE YOU HEADING?</Text>
        <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>Type or choose a preset</Text>
      </View>
      
      <View style={[styles.inputCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
        <Ionicons name="location-outline" size={20} color={colors.primary} style={styles.inputIcon} />
        <TextInput
          style={[styles.textInput, { color: colors.text.primary }]}
          placeholder="e.g. Home, Airport, Client meeting..."
          placeholderTextColor={colors.text.secondary}
          value={destination}
          onChangeText={setDestination}
          accessibilityLabel="Enter destination"
        />
        {destination.length > 0 && (
          <TouchableOpacity 
            onPress={() => setDestination('')} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Clear destination"
          >
            <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.presetsGrid} accessibilityRole="radiogroup" accessibilityLabel="Destination presets">
        {DESTINATION_PRESETS.map(preset => {
          const isSelected = destination.toLowerCase() === preset.label.toLowerCase();
          return (
            <TouchableOpacity
              key={preset.label}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.white,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setDestination(preset.label)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Preset: ${preset.label}`}
            >
              <Ionicons
                name={preset.icon}
                size={16}
                color={isSelected ? '#fff' : colors.text.primary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.presetChipText,
                  {
                    color: isSelected ? '#fff' : colors.text.primary,
                    fontWeight: isSelected ? '700' : '600',
                  },
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

DestinationSection.displayName = 'DestinationSection';

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
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    ...Shadows.sm,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  presetsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  presetChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 20,
    borderWidth: 1,
    ...Shadows.sm,
  },
  presetChipText: {
    fontSize: 12,
  },
});
