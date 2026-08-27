import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { Header }           from '../../src/components/Header';
import { WelcomeCard }      from '../../src/components/WelcomeCard';
import { SOSButton }        from '../../src/components/SOSButton';
import { SafeCheckInCard }  from '../../src/components/SafeCheckInCard';
import { SafeCheckInModal } from '../../src/components/SafeCheckInModal';
import { SafetyNetworkRow } from '../../src/components/SafetyNetworkRow';
import { QuickActions }     from '../../src/components/QuickActions';
import { useSafeCheckIn }   from '../../src/hooks/useSafeCheckIn';
import { useRouter }        from 'expo-router';
import { SafetyFeed }       from '../../src/components/SafetyFeed';

export default function HomeScreen() {
  const { colors } = useTheme();
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const router = useRouter();

  const {
    session,
    timeLeftStr,
    isExpired,
    isActive,
    startCheckIn,
    confirmSafe,
    cancelCheckIn,
  } = useSafeCheckIn();

  // Performance Fix: Memoize these handlers so we don't recreate them 
  // every 30 seconds when the timeLeftStr timer ticks and causes a re-render.
  const openCheckInModal = useCallback(() => setCheckInModalVisible(true), []);
  const closeCheckInModal = useCallback(() => setCheckInModalVisible(false), []);

  const handleStartCheckIn = useCallback(async (data: { destination: string; durationMinutes: number; notifyContacts: boolean }) => {
    await startCheckIn(data);
  }, [startCheckIn]);

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

        {/* 3. Safe Check-In status (idle CTA or active watchdog info) */}
        <SafeCheckInCard
          onStart={openCheckInModal}
          activeCheckIn={isActive ? {
            destination: session?.destination ?? '',
            timeLeftStr: isExpired
              ? '🚨 Deadline passed — confirm you\'re safe!'
              : `${timeLeftStr} • Watchdog on`,
          } : null}
          onConfirmSafe={confirmSafe}
          onCancel={cancelCheckIn}
          onEdit={openCheckInModal}
          isExpired={isExpired}
        />

        {/* 4. Safety Network — horizontal contact row */}
        <SafetyNetworkRow />

        {/* 5. Quick Actions — Security, Medical, Fire (below the fold by design) */}
        <QuickActions />

        {/* 6. Blended security feed — news + community, scoped to the user's area */}
        <SafetyFeed limit={4} onSeeAll={() => router.push('/feed')} />
      </ScrollView>

      {/* Full-Screen Safe Check-In Modal */}
      <SafeCheckInModal
        visible={checkInModalVisible}
        onClose={closeCheckInModal}
        onStartCheckIn={handleStartCheckIn}
        initialSession={isActive ? {
          destination: session?.destination ?? '',
          notifyContacts: session?.notifyContacts ?? true,
        } : null}
      />
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
