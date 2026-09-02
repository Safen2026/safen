import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import type { ThemeColors } from '../src/constants/Theme';
import { GUIDELINES } from '../src/constants/safetyGuidelines';
import { GuidelineCard } from '../src/components/safety/GuidelineCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SafetyGuidelinesScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [expandedKey, setExpandedKey] = useState<string | null>('setup');
  const insets = useSafeAreaInsets();

  const toggle = useCallback((key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Safety Guidelines</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]} 
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          A quick reference for getting the most out of Safen — and staying safer generally.
        </Text>

        {GUIDELINES.map(section => (
          <GuidelineCard
            key={section.key}
            section={section}
            isExpanded={expandedKey === section.key}
            onToggle={toggle}
          />
        ))}

        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.footerNoteText}>
            These guidelines are general safety information, not professional emergency
            training. In a life-threatening situation, contact local emergency services directly.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text.primary },

  intro: { fontSize: 14, color: colors.text.secondary, lineHeight: 20, marginBottom: 16 },

  footerNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginTop: 8, paddingHorizontal: 4,
  },
  footerNoteText: { flex: 1, fontSize: 12, color: colors.text.secondary, lineHeight: 17 },
});
