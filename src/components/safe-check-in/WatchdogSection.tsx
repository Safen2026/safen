import React from 'react';
import { View, Text, StyleSheet, Switch, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';
import { Shadows } from '../../constants/Theme';

interface WatchdogSectionProps {
  notifyContacts: boolean;
  setNotifyContacts: (val: boolean) => void;
  deadlineStr: string;
  initialSession: boolean;
  colors: ThemeColors;
}

export const WatchdogSection = React.memo(({
  notifyContacts,
  setNotifyContacts,
  deadlineStr,
  initialSession,
  colors,
}: WatchdogSectionProps) => {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      {/* Dynamic Deadline Preview Banner */}
      <View style={[styles.deadlineContainer, { backgroundColor: colors.white, borderColor: colors.border }]} accessible={true} accessibilityRole="text" accessibilityLabel={`Deadline set for ${deadlineStr}. Reminder 5 minutes before. Alerts contacts 5 minutes after.`}>
        <View style={styles.deadlineLeft}>
          <Ionicons name="alarm-outline" size={22} color="#10B981" aria-hidden={true} />
          <View style={{ marginLeft: 12 }}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              {initialSession ? 'Add Time' : 'Safe Check-In'}
            </Text>
            <Text style={[styles.deadlineSub, { color: colors.text.secondary }]}>
              Reminder 5 mins before • Alerts contacts 5 mins after
            </Text>
          </View>
        </View>
        <Text style={styles.deadlineBadge}>
          {deadlineStr}
        </Text>
      </View>

      <View style={[styles.sectionHeader, { marginTop: 28 }]} accessible={true} accessibilityRole="header">
        <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>WATCHDOG NOTIFICATION</Text>
      </View>

      <View style={[styles.watchdogCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
        <View style={[styles.watchdogIconWrapper, { backgroundColor: '#10B9811A' }]} aria-hidden={true}>
          <Ionicons name="people" size={20} color="#10B981" />
        </View>
        <View style={styles.watchdogTextContainer}>
          <Text style={[styles.watchdogTitle, { color: colors.text.primary }]}>
            Alert Emergency Contacts
          </Text>
          <Text style={[styles.watchdogSub, { color: colors.text.secondary }]}>
            Sends SMS + live location if missed
          </Text>
        </View>
        <Switch
          value={notifyContacts}
          onValueChange={setNotifyContacts}
          trackColor={{ false: colors.border, true: '#10B981' }}
          thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
          accessibilityRole="switch"
          accessibilityLabel="Alert emergency contacts if check-in is missed"
        />
      </View>
    </View>
  );
});

WatchdogSection.displayName = 'WatchdogSection';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  deadlineContainer: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    ...Shadows.sm,
  },
  deadlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  deadlineSub: {
    fontSize: 11,
    marginTop: 2,
  },
  deadlineBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981',
    backgroundColor: '#10B9811A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginLeft: 34,
  },
  watchdogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    ...Shadows.sm,
  },
  watchdogIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  watchdogTextContainer: {
    flex: 1,
  },
  watchdogTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  watchdogSub: {
    fontSize: 12,
  },
});
