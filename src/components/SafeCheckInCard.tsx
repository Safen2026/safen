import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface SafeCheckInCardProps {
  onStart?: () => void;
  activeCheckIn?: {
    destination: string;
    timeLeftStr?: string;
  } | null;
  onConfirmSafe?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  isExpired?: boolean;
}

export const SafeCheckInCard = ({
  onStart,
  activeCheckIn,
  onConfirmSafe,
  onCancel,
  onEdit,
  isExpired = false,
}: SafeCheckInCardProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const isActive = !!activeCheckIn;

  // Expired state — urgent red pulse strip
  if (isActive && isExpired) {
    return (
      <View style={[styles.expiredContainer, { borderColor: '#EF444430', backgroundColor: '#EF44440D' }]}>
        <View style={styles.expiredRow}>
          <View style={[styles.iconBox, { backgroundColor: '#EF44441A' }]}>
            <MaterialCommunityIcons name="shield-alert" size={19} color="#EF4444" />
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: '#EF4444' }]} numberOfLines={1}>
              Check-in overdue!
            </Text>
            <Text style={[styles.sub, { color: colors.text.secondary }]} numberOfLines={1}>
              Contacts alerted in 5 min — confirm now
            </Text>
          </View>
        </View>
        <View style={styles.expiredActions}>
          <TouchableOpacity
            style={[styles.safeBtn, { backgroundColor: '#10B981' }]}
            onPress={onConfirmSafe}
            accessibilityLabel="I arrived safely"
          >
            <Ionicons name="checkmark" size={14} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.safeBtnText}>I'm Safe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onEdit}
            accessibilityLabel="Edit timer"
            style={[styles.capsuleBtn, { backgroundColor: '#EF444415' }]}
          >
            <Text style={[styles.ctaText, { color: '#EF4444' }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.border }]}
            onPress={onCancel}
            accessibilityLabel="Cancel check-in"
          >
            <Text style={[styles.cancelBtnText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Active state — normal watchdog row
  if (isActive) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}14` }]}>
          <MaterialCommunityIcons name="shield-check" size={19} color={colors.primary} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
            To {activeCheckIn!.destination}
          </Text>
          <Text style={[styles.sub, { color: colors.text.secondary }]} numberOfLines={1}>
            {activeCheckIn!.timeLeftStr ?? 'Watchdog timer active'}
          </Text>
        </View>
        <View style={styles.activeActions}>
          <TouchableOpacity
            onPress={onConfirmSafe}
            accessibilityLabel="I arrived safely"
            style={[styles.capsuleBtn, { backgroundColor: '#10B9811A' }]}
          >
            <Text style={[styles.ctaText, { color: '#10B981' }]}>I'm Safe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onEdit}
            accessibilityLabel="Edit timer"
            style={[styles.capsuleBtn, { backgroundColor: `${colors.primary}15` }]}
          >
            <Text style={[styles.ctaText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCancel}
            accessibilityLabel="Cancel check-in"
            style={[styles.capsuleBtn, { backgroundColor: `${colors.text.secondary}15` }]}
          >
            <Text style={[styles.ctaText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Idle state — subtle CTA
  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: `${colors.text.secondary}14` }]}>
        <MaterialCommunityIcons name="timer-sand" size={19} color={colors.text.secondary} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
          Safe Check-In
        </Text>
        <Text style={[styles.sub, { color: colors.text.secondary }]} numberOfLines={1}>
          Set a destination & safety timer
        </Text>
      </View>
      <TouchableOpacity
        onPress={onStart}
        accessibilityLabel="Start Safe Check-In"
        style={[styles.capsuleBtn, { backgroundColor: `${colors.text.secondary}15` }]}
      >
        <Text style={[styles.ctaText, { color: colors.text.primary }]}>Start</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
    gap: 14,
  },
  expiredContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    ...Shadows.sm,
    gap: 12,
  },
  expiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  expiredActions: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 50, // align with text block
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  sub: {
    fontSize: 12,
  },
  activeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capsuleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
  },
  separator: {
    fontSize: 16,
    opacity: 0.4,
  },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  safeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
