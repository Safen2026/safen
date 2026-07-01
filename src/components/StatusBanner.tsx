import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const StatusBanner = () => {
  const { colors } = useTheme();
  // For testing purposes, you can toggle this by tapping the banner
  const [isAtHome, setIsAtHome] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={() => setIsAtHome(!isAtHome)}
        style={[
          styles.pill,
          { 
            backgroundColor: isAtHome ? colors.status.safeBackground : colors.status.warningBackground,
            borderColor: isAtHome ? colors.status.safeText + '40' : colors.status.warningText + '40'
          }
        ]}
      >
        <View style={[
          styles.dot, 
          { backgroundColor: isAtHome ? colors.status.safeText : colors.status.warningText }
        ]} />
        <Text style={[
          styles.text, 
          { color: isAtHome ? colors.status.safeText : colors.status.warningText }
        ]}>
          {isAtHome ? "Status: Safe at Home (Auto-Notify Active)" : "Status: Out (Tracking Active)"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    fontWeight: '600',
    fontSize: 13,
  },
});
