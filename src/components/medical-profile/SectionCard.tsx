import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface SectionCardProps {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  completeBadge?: boolean;
}

export const SectionCard = memo(function SectionCard({
  title,
  icon,
  color,
  expanded,
  onToggle,
  children,
  completeBadge,
}: SectionCardProps) {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.card, { borderColor: expanded ? color : colors.border, backgroundColor: colors.white }]}>
      <TouchableOpacity 
        style={styles.header} 
        onPress={onToggle} 
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Toggle ${title} section`}
        accessibilityState={{ expanded }}
      >
        <View style={[styles.iconBox, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
        {completeBadge && (
          <View style={styles.completeBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#00875A" />
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text.secondary}
          style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { 
    borderRadius: 14, 
    borderWidth: 1.5, 
    marginBottom: 12, 
    overflow: 'hidden', 
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    gap: 12 
  },
  iconBox: { 
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  title: { 
    fontSize: 16, 
    fontWeight: '700' 
  },
  completeBadge: { 
    marginLeft: 8 
  },
  body: { 
    paddingHorizontal: 16, 
    paddingBottom: 20, 
    paddingTop: 4 
  },
});
