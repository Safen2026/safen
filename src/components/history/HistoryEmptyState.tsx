import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export function HistoryEmptyState() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
        <Ionicons name="document-text-outline" size={36} color={colors.text.secondary} />
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>No history found</Text>
      <Text style={[styles.sub, { color: colors.text.secondary }]}>
        No events match the selected filter.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  sub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
