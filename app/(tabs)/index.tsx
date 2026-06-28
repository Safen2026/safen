import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { StatusBanner } from '../../src/components/StatusBanner';
import { SOSButton } from '../../src/components/SOSButton';
import { QuickActions } from '../../src/components/QuickActions';
import { AIRiskCard } from '../../src/components/AIRiskCard';
import { RecentAlerts } from '../../src/components/RecentAlerts';
import { Colors } from '../../src/constants/Theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
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
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  }
});
