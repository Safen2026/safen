import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';

export interface ActiveCheckInState {
  destination: string;
  timeLeftStr?: string;
}

interface SafeCheckInCardProps {
  onStart?: () => void;
  activeCheckIn?: ActiveCheckInState | null;
  onConfirmSafe?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  isExpired?: boolean;
}

// ─── Sub-Components (DRY & Accessibility) ────────────────────────────────────

type IconProps = {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  bgColor: string;
  styles: ReturnType<typeof getStyles>;
  size?: number;
};
const StatusIcon = React.memo(({ name, color, bgColor, styles, size = 19 }: IconProps) => (
  <View style={[styles.iconBox, { backgroundColor: bgColor }]} aria-hidden={true}>
    <MaterialCommunityIcons name={name} size={size} color={color} />
  </View>
));
StatusIcon.displayName = 'StatusIcon';

type TextProps = {
  title: string;
  sub: string;
  titleColor: string;
  subColor: string;
  styles: ReturnType<typeof getStyles>;
};
const StatusText = React.memo(({ title, sub, titleColor, subColor, styles }: TextProps) => (
  <View style={styles.textBlock} accessible={true} accessibilityRole="text" accessibilityLabel={`${title}. ${sub}`}>
    <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>{title}</Text>
    <Text style={[styles.sub, { color: subColor }]} numberOfLines={1}>{sub}</Text>
  </View>
));
StatusText.displayName = 'StatusText';

type ActionBtnProps = {
  label: string;
  onPress?: () => void;
  textColor: string;
  styles: ReturnType<typeof getStyles>;
  bgColor?: string;
  borderColor?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  accessibilityLabel?: string;
};
const ActionButton = React.memo(({ label, onPress, textColor, styles, bgColor, borderColor, icon, iconColor, accessibilityLabel }: ActionBtnProps) => {
  return (
    <TouchableOpacity
      style={[
        bgColor ? styles.capsuleBtn : styles.cancelBtn,
        bgColor ? { backgroundColor: bgColor } : { borderColor: borderColor },
        icon && styles.safeBtn
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      activeOpacity={0.7}
    >
      {icon && <Ionicons name={icon} size={14} color={iconColor} style={{ marginRight: 4 }} />}
      <Text style={[icon ? styles.safeBtnText : (bgColor ? styles.ctaText : styles.cancelBtnText), { color: textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});
ActionButton.displayName = 'ActionButton';

// ─── Main Component ──────────────────────────────────────────────────────────

export const SafeCheckInCard = React.memo(({
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
      <View style={[styles.expiredContainer, { borderColor: '#EF444430', backgroundColor: '#EF44440D' }]} accessibilityRole="alert" aria-live="assertive">
        <View style={styles.expiredRow}>
          <StatusIcon name="shield-alert" color="#EF4444" bgColor="#EF44441A" styles={styles} />
          <StatusText title="Check-in overdue!" sub="Contacts alerted in 5 min — confirm now" titleColor="#EF4444" subColor={colors.text.secondary} styles={styles} />
        </View>
        <View style={styles.expiredActions}>
          <ActionButton label="I'm Safe" accessibilityLabel="I arrived safely" icon="checkmark" iconColor="#fff" textColor="#fff" bgColor="#10B981" onPress={onConfirmSafe} styles={styles} />
          <ActionButton label="Edit" accessibilityLabel="Edit timer" textColor="#EF4444" bgColor="#EF444415" onPress={onEdit} styles={styles} />
          <ActionButton label="Cancel" accessibilityLabel="Cancel check-in" textColor={colors.text.secondary} borderColor={colors.border} onPress={onCancel} styles={styles} />
        </View>
      </View>
    );
  }

  // Active state — normal watchdog row
  if (isActive) {
    return (
      <View style={styles.container}>
        <StatusIcon name="shield-check" color={colors.primary} bgColor={`${colors.primary}14`} styles={styles} />
        <StatusText title={`To ${activeCheckIn?.destination ?? '—'}`} sub={activeCheckIn?.timeLeftStr ?? 'Watchdog timer active'} titleColor={colors.text.primary} subColor={colors.text.secondary} styles={styles} />
        <View style={styles.activeActions}>
          <ActionButton label="I'm Safe" accessibilityLabel="I arrived safely" textColor="#10B981" bgColor="#10B9811A" onPress={onConfirmSafe} styles={styles} />
          <ActionButton label="Edit" accessibilityLabel="Edit timer" textColor={colors.primary} bgColor={`${colors.primary}15`} onPress={onEdit} styles={styles} />
          <ActionButton label="Cancel" accessibilityLabel="Cancel check-in" textColor={colors.text.secondary} bgColor={`${colors.text.secondary}15`} onPress={onCancel} styles={styles} />
        </View>
      </View>
    );
  }

  // Idle state — subtle CTA
  return (
    <View style={styles.container}>
      <StatusIcon name="timer-sand" color={colors.text.secondary} bgColor={`${colors.text.secondary}14`} styles={styles} />
      <StatusText title="Safe Check-In" sub="Set a destination & safety timer" titleColor={colors.text.primary} subColor={colors.text.secondary} styles={styles} />
      <ActionButton label="Start" accessibilityLabel="Start safe check-in" textColor={colors.text.primary} bgColor={`${colors.text.secondary}15`} onPress={onStart} styles={styles} />
    </View>
  );
});
SafeCheckInCard.displayName = 'SafeCheckInCard';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 14,
  },
  expiredContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
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
