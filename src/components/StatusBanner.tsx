import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Theme';

export const StatusBanner = () => {
  // For testing purposes, you can toggle this by tapping the banner
  const [isAtHome, setIsAtHome] = useState(true);

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={() => setIsAtHome(!isAtHome)}
        style={[
          styles.pill,
          { 
            backgroundColor: isAtHome ? Colors.status.safeBackground : Colors.status.warningBackground,
            borderColor: isAtHome ? '#AEE4C9' : '#FDE68A'
          }
        ]}
      >
        <View style={[
          styles.dot, 
          { backgroundColor: isAtHome ? Colors.status.safeText : Colors.status.warningText }
        ]} />
        <Text style={[
          styles.text, 
          { color: isAtHome ? Colors.status.safeText : Colors.status.warningText }
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
    backgroundColor: Colors.background,
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
