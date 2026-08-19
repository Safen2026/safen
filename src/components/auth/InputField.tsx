import React, { useState, memo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  icon: React.ReactNode;
  maxLength?: number;
}

export const InputField = memo(function InputField({
  label, 
  placeholder, 
  value, 
  onChangeText,
  secureTextEntry = false, 
  keyboardType = 'default',
  autoCapitalize = 'none', 
  icon,
  maxLength,
}: InputFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry);
  
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.text.primary }]}>{label}</Text>
      <View style={[
        styles.row, 
        { borderColor: colors.border, backgroundColor: colors.background },
        focused && { borderColor: '#0A2463' }
      ]}>
        <View style={styles.iconSlot}>{icon}</View>
        <TextInput
          style={[styles.input, { color: colors.text.primary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.text.secondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
        />
        {secureTextEntry && (
          <TouchableOpacity 
            onPress={() => setHidden(h => !h)} 
            style={styles.eyeSlot} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={hidden ? `Show ${label}` : `Hide ${label}`}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 13, 
    fontWeight: '600', 
    marginBottom: 6, 
    letterSpacing: 0.1 
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    height: 52, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 2, 
    elevation: 2 
  },
  iconSlot: { 
    marginRight: 10 
  },
  input: { 
    flex: 1, 
    fontSize: 15 
  },
  eyeSlot: { 
    marginLeft: 8 
  },
});
