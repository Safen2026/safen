import React, { useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Allergy, Severity } from '../../types/medical';

interface AllergyInputProps {
  allergies: Allergy[];
  onAdd: (a: Allergy) => void;
  onRemove: (i: number) => void;
}

export const AllergyInput = memo(function AllergyInput({
  allergies,
  onAdd,
  onRemove,
}: AllergyInputProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [severity, setSeverity] = useState<Severity>('mild');

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    
    // Application-layer DoS protection
    if (trimmed.length > 50) {
      Alert.alert('Error', 'Allergy name cannot exceed 50 characters.');
      return;
    }
    
    onAdd({ name: trimmed, severity });
    setValue('');
  }, [value, severity, onAdd]);

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: colors.text.primary, borderColor: colors.border, backgroundColor: colors.background }]}
          value={value}
          onChangeText={setValue}
          placeholder="e.g. Penicillin"
          placeholderTextColor={colors.text.secondary}
          onSubmitEditing={submit}
          returnKeyType="done"
          maxLength={50}
          accessibilityLabel="Add Allergy"
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Submit Allergy"
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Severity selector */}
      <View style={styles.severityRow}>
        {(['mild', 'severe'] as Severity[]).map(s => {
          const isSelected = severity === s;
          const isSevere = s === 'severe';
          const activeColor = isSevere ? '#DC2626' : '#EA580C';
          const activeBg = isSevere ? '#DC262618' : '#EA580C18';
          
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.severityBtn,
                {
                  borderColor: isSelected ? activeColor : colors.border,
                  backgroundColor: isSelected ? activeBg : colors.background,
                }
              ]}
              onPress={() => setSeverity(s)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${s} severity`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[
                styles.severityText, 
                { color: isSelected ? activeColor : colors.text.secondary }
              ]}>
                {isSevere ? '🚨 Severe' : '⚠️ Mild'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.tagsRow}>
        {allergies.map((a, i) => (
          <View key={`${a.name}-${i}`} style={[styles.tag, {
            backgroundColor: a.severity === 'severe' ? '#DC262618' : '#EA580C18',
            borderColor: a.severity === 'severe' ? '#DC262640' : '#EA580C40',
          }]}>
            <Text style={styles.emojiText}>{a.severity === 'severe' ? '🚨' : '⚠️'}</Text>
            <Text style={[styles.tagText, { color: a.severity === 'severe' ? '#DC2626' : '#EA580C' }]}>{a.name}</Text>
            <TouchableOpacity 
              onPress={() => onRemove(i)} 
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${a.name} allergy`}
            >
              <Ionicons name="close" size={14} color={a.severity === 'severe' ? '#DC2626' : '#EA580C'} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  inputRow: { 
    flexDirection: 'row', 
    gap: 8, 
    marginBottom: 10 
  },
  input: { 
    flex: 1, 
    borderWidth: 1, 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    height: 42, 
    fontSize: 14 
  },
  addBtn: { 
    width: 42, 
    height: 42, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#DC2626'
  },
  severityRow: { 
    flexDirection: 'row', 
    gap: 8, 
    marginBottom: 12 
  },
  severityBtn: {
    flex: 1, 
    paddingVertical: 7, 
    borderRadius: 8, 
    borderWidth: 1,
    alignItems: 'center',
  },
  severityText: { 
    fontSize: 13, 
    fontWeight: '700' 
  },
  tagsRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8 
  },
  tag: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 20, 
    borderWidth: 1 
  },
  emojiText: { 
    fontSize: 11, 
    marginRight: 2 
  },
  tagText: { 
    fontSize: 13, 
    fontWeight: '600',
    marginRight: 6
  },
});
