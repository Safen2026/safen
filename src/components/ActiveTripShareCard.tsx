import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface ActiveTripShareCardProps {
  contactName: string;
  remainingStr: string;
  isEnding: boolean;
  onStopSharing: () => void;
  onExtend: (minutes: number) => void;
}

export const ActiveTripShareCard = ({
  contactName,
  remainingStr,
  isEnding,
  onStopSharing,
  onExtend,
}: ActiveTripShareCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleExtend = () => {
    Alert.alert(
      'Extend Sharing',
      'Add more time to your live location share?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '+15 min', onPress: () => onExtend(15) },
        { text: '+30 min', onPress: () => onExtend(30) },
      ]
    );
  };

  const handleStop = () => {
    Alert.alert(
      'Stop Sharing?',
      `${contactName} will be notified that you stopped sharing your location.`,
      [
        { text: 'Keep Sharing', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: onStopSharing },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Top row: live badge + remaining time */}
      <View style={styles.topRow}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>SHARING</Text>
        </View>
        <TouchableOpacity style={styles.extendBtn} onPress={handleExtend} disabled={isEnding}>
          <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
          <Text style={[styles.extendText, { color: colors.primary }]}>Extend</Text>
        </TouchableOpacity>
      </View>

      {/* Contact row */}
      <View style={styles.contactRow}>
        <View style={[styles.contactAvatar, { backgroundColor: `${colors.primary}15` }]}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.sharingWith}>Sharing location with</Text>
          <Text style={styles.contactName} numberOfLines={1}>{contactName}</Text>
        </View>
        <View style={styles.timerBox}>
          <Ionicons name="time-outline" size={13} color={colors.text.secondary} />
          <Text style={styles.timerText}>{remainingStr}</Text>
        </View>
      </View>

      {/* Stop button */}
      <TouchableOpacity
        style={[styles.stopBtn, isEnding && { opacity: 0.6 }]}
        onPress={handleStop}
        disabled={isEnding}
        activeOpacity={0.8}
      >
        {isEnding ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <>
            <Ionicons name="stop-circle-outline" size={17} color="#EF4444" />
            <Text style={styles.stopText}>Stop Sharing</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98115',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  liveText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  extendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  sharingWith: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF444430',
    backgroundColor: '#EF444408',
  },
  stopText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
