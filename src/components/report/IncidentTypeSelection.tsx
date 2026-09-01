import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';

export type IncidentType = 'medical' | 'fire' | 'security' | 'missing_person';
type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const INCIDENT_CATEGORIES: { id: string; label: string; icon: MCIName; color: string; bgColor: string; darkBgColor: string }[] = [
  { id: 'medical',        label: 'Medical',        icon: 'medical-bag',       color: '#D92D20', bgColor: '#FEF3F2', darkBgColor: '#3F1D1D' },
  { id: 'fire',          label: 'Fire',           icon: 'fire',              color: '#DC6803', bgColor: '#FFFAEB', darkBgColor: '#3D250E' },
  { id: 'security',      label: 'Security',       icon: 'shield-outline',    color: '#1570EF', bgColor: '#EFF8FF', darkBgColor: '#172B4D' },
  { id: 'missing_person', label: 'Missing Person', icon: 'account-search-outline', color: '#7A5AF8', bgColor: '#F4F3FF', darkBgColor: '#2A2342' },
];

interface IncidentTypeSelectionProps {
  selectedType: IncidentType | null;
  onSelectType: (type: IncidentType) => void;
  onNext: () => void;
  colors: ThemeColors;
  isDark: boolean;
}

export const IncidentTypeSelection = React.memo(function IncidentTypeSelection({
  selectedType,
  onSelectType,
  onNext,
  colors,
  isDark
}: IncidentTypeSelectionProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.titleCentered} accessibilityRole="header">What type of emergency is{'\n'}this?</Text>
        <Text style={styles.subtitleCentered}>
          Select the category that best describes the situation.
        </Text>

        <View style={styles.grid}>
          {INCIDENT_CATEGORIES.map((cat) => {
            const isSelected = selectedType === cat.id;
            const activeBgColor = isDark ? cat.darkBgColor : cat.bgColor;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.card,
                  isSelected && {
                    borderColor: cat.color,
                    backgroundColor: activeBgColor,
                    borderWidth: 1.5,
                  }
                ]}
                activeOpacity={0.7}
                onPress={() => onSelectType(cat.id as IncidentType)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${cat.label} emergency`}
                accessibilityState={{ selected: isSelected }}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark-circle" size={22} color={cat.color} />
                  </View>
                )}
                <View style={[styles.iconCircle, { backgroundColor: isSelected ? colors.white : activeBgColor }]}>
                  <MaterialCommunityIcons name={cat.icon} size={32} color={cat.color} />
                </View>
                <Text style={[styles.cardLabel, isSelected && { color: isDark ? colors.text.primary : cat.color }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity 
          style={[styles.nextButton, { marginTop: 32 }, !selectedType && styles.nextButtonDisabled]}
          disabled={!selectedType}
          activeOpacity={0.8}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Next step: Add Location"
          accessibilityState={{ disabled: !selectedType }}
        >
          <Text style={styles.nextButtonText}>Next: Add Location</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
        </TouchableOpacity>
      </ScrollView>
    </>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 32,
    justifyContent: 'center',
  },
  titleCentered: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  subtitleCentered: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 10,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    width: '47%',
    aspectRatio: 0.95,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  nextButton: {
    backgroundColor: '#00875A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
