import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Guideline } from '../../constants/safetyGuidelines';

interface GuidelineCardProps {
  section: Guideline;
  isExpanded: boolean;
  onToggle: (key: string) => void;
}

export const GuidelineCard = memo(function GuidelineCard({
  section,
  isExpanded,
  onToggle,
}: GuidelineCardProps) {
  const { colors } = useTheme();
  
  // IconComponent is dynamically Ionicons or MCI
  const IconComponent = section.iconSet === 'mci' ? MaterialCommunityIcons : Ionicons;

  return (
    <View style={[styles.card, { borderColor: isExpanded ? section.color : colors.border, backgroundColor: colors.white }]}>
      <TouchableOpacity 
        style={styles.cardHeader} 
        onPress={() => onToggle(section.key)} 
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Toggle ${section.title} guidelines`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={[styles.iconBox, { backgroundColor: section.color + '18' }]}>
          <IconComponent name={section.icon as never} size={20} color={section.color} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{section.title}</Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.text.secondary}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.cardBody}>
          {section.points.map((point, i) => (
            <View key={i} style={styles.pointRow}>
              <View style={[styles.bullet, { backgroundColor: section.color }]} />
              <Text style={[styles.pointText, { color: colors.text.secondary }]}>{point}</Text>
            </View>
          ))}
        </View>
      )}
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
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    gap: 12 
  },
  iconBox: { 
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  cardTitle: { 
    flex: 1, 
    fontSize: 15, 
    fontWeight: '700',
  },
  cardBody: { 
    paddingHorizontal: 16, 
    paddingBottom: 16, 
    gap: 10 
  },
  pointRow: { 
    flexDirection: 'row', 
    gap: 10 
  },
  bullet: { 
    width: 6, 
    height: 6, 
    borderRadius: 3, 
    marginTop: 7 
  },
  pointText: { 
    flex: 1, 
    fontSize: 13.5, 
    lineHeight: 19 
  },
});
