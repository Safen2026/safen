import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { Shadows } from '../../src/constants/Theme';
import { Header }           from '../../src/components/Header';
import { WelcomeCard }      from '../../src/components/WelcomeCard';
import { SOSButton }        from '../../src/components/SOSButton';
import { SafeCheckInCard }  from '../../src/components/SafeCheckInCard';
import { SafeCheckInModal } from '../../src/components/SafeCheckInModal';
import { SafetyNetworkRow } from '../../src/components/SafetyNetworkRow';
import { QuickActions }     from '../../src/components/QuickActions';
import { useSafeCheckIn }   from '../../src/hooks/useSafeCheckIn';
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

  const handleSeeAllFeed = useCallback(() => router.push('/feed'), [router]);

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

        {/* 4. Quick Actions — Security, Medical, Fire */}
        <QuickActions />

        {/* 5. Safety Network - horizontal contact row */}
        <SafetyNetworkRow />

        {/* Safety Guidelines Card */}
        <TouchableOpacity 
          style={[styles.safetyCard, { backgroundColor: colors.white, borderColor: colors.border }]} 
          onPress={() => router.push('/safety-guidelines')}
          activeOpacity={0.8}
        >
          <View style={styles.safetyCardContent}>
            <View style={styles.safetyIconContainer}>
              <Ionicons name="newspaper" size={24} color="#EF4444" />
            </View>
            <View style={styles.safetyTextContainer}>
              <Text style={[styles.safetyTitle, { color: colors.text.primary }]}>Stay Safe, Stay Informed</Text>
              <Text style={[styles.safetySubtitle, { color: colors.text.secondary }]}>Read safety tips and real-time updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </View>
        </TouchableOpacity>

        {/* 6. Blended security feed - news + community, scoped to the user's area */}
        <SafetyFeed limit={4} onSeeAll={handleSeeAllFeed} />
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
  safetyCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  safetyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  safetyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  safetyTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  safetySubtitle: {
    fontSize: 12,
  },
});
