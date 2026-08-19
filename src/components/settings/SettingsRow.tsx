import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../../constants/Theme';

interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  isDestructive?: boolean;
  colors: ThemeColors;
}

export const SettingsRow = memo(function SettingsRow({
  icon,
  title,
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
      accessibilityLabel={title}
    >
      <View style={[styles.iconBox, isDestructive && { backgroundColor: '#EF444415' }]}>
        <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : colors.text.secondary} />
      </View>
      <Text style={[styles.rowText, isDestructive && { color: '#EF4444' }]}>{title}</Text>
      <View style={styles.rightContentBox}>
        {rightContent}
      </View>
    </TouchableOpacity>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  rowText: { fontSize: 16, color: colors.text.primary, fontWeight: '500', flex: 1 },
  rightContentBox: { flexDirection: 'row', alignItems: 'center' },
});
