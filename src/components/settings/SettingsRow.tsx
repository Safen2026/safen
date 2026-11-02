import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../../constants/Theme';

interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string | React.ReactNode;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  isDestructive?: boolean;
  colors: ThemeColors;
}

export const SettingsRow = memo(function SettingsRow({
  icon,
  title,
  subtitle,
  rightContent,
  onPress,
  isDestructive = false,
  colors,
}: SettingsRowProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessible={true}
      accessibilityRole={onPress ? "button" : "none"}
      accessibilityLabel={typeof subtitle === 'string' ? `${title}, ${subtitle}` : title}
    >
      <View style={[styles.iconBox, isDestructive && { backgroundColor: '#EF444415' }]}>
        <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : colors.text.secondary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.rowText, isDestructive && { color: '#EF4444' }]}>{title}</Text>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={[styles.subtitleText, { color: colors.text.secondary }]}>{subtitle}</Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      <View style={styles.rightContentBox}>
        {rightContent}
      </View>
    </TouchableOpacity>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  textContainer: { flex: 1, justifyContent: 'center' },
  rowText: { fontSize: 16, color: colors.text.primary, fontWeight: '500' },
  subtitleText: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  rightContentBox: { flexDirection: 'row', alignItems: 'center' },
});
