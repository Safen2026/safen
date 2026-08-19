import React, { useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface TagInputProps {
  tags: string[];
  onAdd: (t: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
  color: string;
}

export const TagInput = memo(function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  color,
}: TagInputProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    
    // Application-layer DoS protection
    if (trimmed.length > 50) {
      Alert.alert('Error', 'Tag cannot exceed 50 characters.');
      return;
    }
    
    if (!tags.includes(trimmed)) {
      onAdd(trimmed);
      setValue('');
    }
  }, [value, tags, onAdd]);

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: colors.text.primary, borderColor: colors.border, backgroundColor: colors.background }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.text.secondary}
          onSubmitEditing={submit}
          returnKeyType="done"
          maxLength={50}
          accessibilityLabel={`Add ${placeholder}`}
        />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: color }]}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Add Tag"
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.tagsRow}>
        {tags.map((tag, i) => (
          <View key={`${tag}-${i}`} style={[styles.tag, { backgroundColor: color + '18', borderColor: color + '40' }]}>
            <Text style={[styles.tagText, { color }]}>{tag}</Text>
            <TouchableOpacity 
              onPress={() => onRemove(i)} 
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
            >
              <Ionicons name="close" size={14} color={color} />
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
    alignItems: 'center' 
  },
  tagsRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8 
  },
  tag: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 20, 
    borderWidth: 1 
  },
  tagText: { 
    fontSize: 13, 
    fontWeight: '600' 
  },
});
