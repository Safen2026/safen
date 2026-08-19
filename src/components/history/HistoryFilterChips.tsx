import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Shadows } from '../../constants/Theme';
import { FILTERS } from '../../hooks/useHistory';

type Props = {
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
};

const HistoryFilterChipsComponent = ({ activeFilter, onSelectFilter }: Props) => {
  const { colors } = useTheme();

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={styles.scrollContent}
    >
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter;
        
        return (
          <TouchableOpacity
            key={filter}
            style={[
              styles.chip,
              isActive ? styles.chipActive : undefined,
              !isActive && { borderColor: colors.border, backgroundColor: colors.background }
            ]}
            onPress={() => onSelectFilter(filter)}
            activeOpacity={0.7}
            role="button"
            aria-label={`Filter by ${filter}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text 
              style={[
                styles.chipText,
                isActive ? styles.chipTextActive : { color: colors.text.secondary }
              ]}
              numberOfLines={1}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    ...Shadows.sm,
    shadowOpacity: 0.04,
    elevation: 2,
  },
  chipActive: {
    backgroundColor: '#E02B2B', // Matches SOS red from TYPE_META
    borderColor: '#E02B2B',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});

export const HistoryFilterChips = React.memo(HistoryFilterChipsComponent);
HistoryFilterChips.displayName = 'HistoryFilterChips';
