import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { Header }           from '../../src/components/Header';
import { WelcomeCard }      from '../../src/components/WelcomeCard';
import { SOSButton }        from '../../src/components/SOSButton';
import { JourneyCard }      from '../../src/components/JourneyCard';
import { SafetyNetworkRow } from '../../src/components/SafetyNetworkRow';
import { QuickActions }     from '../../src/components/QuickActions';

export default function HomeScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Personalised welcome */}
        <WelcomeCard />

        {/* 2. SOS — always above the fold, always accessible */}
        <SOSButton />

        {/* 3. Journey / Check-In status (idle CTA or active trip info) */}
        <JourneyCard />

        {/* 4. Safety Network — horizontal contact row */}
        <SafetyNetworkRow />

        {/* 5. Quick Actions — Security, Medical, Fire (below the fold by design) */}
        <QuickActions />
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
  },
});
