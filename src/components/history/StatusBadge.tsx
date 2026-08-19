import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/Theme';

type StatusBadgeProps = {
  status: string | null;
};

const getStatusColors = (status: string | null): { color: string; bg: string } => {
  if (!status) return { color: '#3B82F6', bg: '#3B82F615' };
  const s = status.toLowerCase();
  if (s === 'active' || s === 'resolved') return { color: '#10B981', bg: '#10B98115' };
  if (s === 'cancelled') return { color: '#6B7280', bg: '#6B728015' };
  if (s === 'pending' || s === 'open') return { color: '#F59E0B', bg: '#F59E0B15' };
  return { color: '#3B82F6', bg: '#3B82F615' };
};

const StatusBadgeComponent = ({ status }: StatusBadgeProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (!status) return null;
  
  const { color, bg } = getStatusColors(status);
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
};

export const StatusBadge = React.memo(StatusBadgeComponent);
StatusBadge.displayName = 'StatusBadge';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
