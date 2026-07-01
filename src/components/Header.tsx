import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar as RNStatusBar, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Theme';

export const Header = () => {
  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={24} color={Colors.white} />
        </View>
        <View style={styles.greetingContainer}>
          <Text style={styles.greetingText}>Hello, David</Text>
          <Text style={styles.subtitleText}>Stay safe today</Text>
        </View>
      </View>
      
      <View style={styles.rightContent}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="moon-outline" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <View style={styles.badge} />
          <Ionicons name="notifications-outline" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 10 : 40 : 50,
    paddingBottom: 15,
    backgroundColor: Colors.background,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#00875A', // Using the app's green accent
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  greetingContainer: {
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitleText: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary, // Red badge for alerts
    borderWidth: 1.5,
    borderColor: Colors.white,
    zIndex: 1,
  },
});
