import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import { Header }           from '../../src/components/Header';
import { WelcomeCard }      from '../../src/components/WelcomeCard';
import { SOSButton }        from '../../src/components/SOSButton';
import { SafeCheckInCard }  from '../../src/components/SafeCheckInCard';
import { SafeCheckInModal } from '../../src/components/SafeCheckInModal';
import { SafetyNetworkRow } from '../../src/components/SafetyNetworkRow';
import { QuickActions }     from '../../src/components/QuickActions';
import { useSafeCheckIn }   from '../../src/hooks/useSafeCheckIn';

export default function HomeScreen() {
  const { colors } = useTheme();
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);

  const {
    session,
    timeLeftStr,
    isExpired,
    isActive,
    startCheckIn,
    confirmSafe,
    cancelCheckIn,
  } = useSafeCheckIn();

  const handleStartCheckIn = async (data: { destination: string; durationMinutes: number; notifyContacts: boolean }) => {
    await startCheckIn(data);
  };

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
          onStart={() => setCheckInModalVisible(true)}
          activeCheckIn={isActive ? {
            destination: session!.destination,
            timeLeftStr: isExpired
              ? '🚨 Deadline passed — confirm you\'re safe!'
              : `${timeLeftStr} • Watchdog on`,
          } : null}
          onConfirmSafe={confirmSafe}
          onCancel={cancelCheckIn}
          onEdit={() => setCheckInModalVisible(true)}
          isExpired={isExpired}
        />

        {/* 4. Safety Network — horizontal contact row */}
        <SafetyNetworkRow />

        {/* 5. Quick Actions — Security, Medical, Fire (below the fold by design) */}
        <QuickActions />
      </ScrollView>

      {/* Full-Screen Safe Check-In Modal */}
      <SafeCheckInModal
        visible={checkInModalVisible}
        onClose={() => setCheckInModalVisible(false)}
        onStartCheckIn={handleStartCheckIn}
        initialSession={isActive ? {
          destination: session!.destination,
          notifyContacts: session!.notifyContacts,
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
