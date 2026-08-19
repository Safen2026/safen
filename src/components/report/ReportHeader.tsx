import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';

interface ReportHeaderProps {
  step: number;
  onBack: () => void;
  colors: ThemeColors;
}

export const ReportHeader = React.memo(function ReportHeader({ step, onBack, colors }: ReportHeaderProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={onBack}
          disabled={step === 1}
          accessibilityRole="button"
          accessibilityLabel={step > 1 ? "Go back to previous step" : "Back button disabled"}
          accessibilityState={{ disabled: step === 1 }}
        >
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={step > 1 ? '#00875A' : colors.text.primary} 
          />
        </TouchableOpacity>
        <View style={styles.stepContainer}>
          <Text style={styles.stepText} accessibilityRole="header">Step {step} of 3</Text>
          <View style={styles.dotsRow} accessibilityRole="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
            <View style={[styles.dot, step === 1 && styles.dotActive]} />
            <View style={[styles.dot, step === 2 && styles.dotActive]} />
            <View style={[styles.dot, step === 3 && styles.dotActive]} />
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.divider} />
    </>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#00875A',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.5,
  },
});
