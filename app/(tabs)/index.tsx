import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { StatusBanner } from '../../src/components/StatusBanner';
import { SOSButton } from '../../src/components/SOSButton';
import { QuickActions } from '../../src/components/QuickActions';
import { AIRiskCard } from '../../src/components/AIRiskCard';
import { RecentAlerts } from '../../src/components/RecentAlerts';
import { useTheme } from '../../src/context/ThemeContext';

export default function HomeScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <StatusBanner />
        <SOSButton />
        <QuickActions />
        <AIRiskCard />
        <RecentAlerts />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  }
});
