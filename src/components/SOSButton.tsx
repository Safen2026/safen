import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../constants/Theme';

export const SOSButton = () => {
  const [isActivated, setIsActivated] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const holdTimeout = useRef<NodeJS.Timeout | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (pulseLoop.current) {
      pulseLoop.current.stop();
    }
    
    pulseAnim.setValue(0);
    
    pulseLoop.current = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: isActivated ? 500 : 2000,
        useNativeDriver: true,
      })
    );
    
    pulseLoop.current.start();
    
    return () => {
      if (pulseLoop.current) {
        pulseLoop.current.stop();
      }
    };
  }, [isActivated, pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5], // Scales from 1x to 1.5x size
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.6, 0.2, 0], // Fades out as it expands
  });

  const chargeScale = holdAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 1], // Instantly pops to 25% size so the user sees it building
  });

  const chargeOpacity = holdAnim.interpolate({
    inputRange: [0, 0.05, 1],
    outputRange: [0, 1, 1], // Instantly fades in the dark circle
  });

  const handlePressIn = () => {
    // Physically shrink the button slightly to show it's pressed down
    Animated.spring(buttonScaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();

    Animated.timing(holdAnim, {
      toValue: 1,
      duration: 3000, // 3 seconds to trigger
      useNativeDriver: true,
    }).start();

    holdTimeout.current = setTimeout(() => {
      toggleEmergency();
    }, 3000);
  };

  const handlePressOut = () => {
    if (holdTimeout.current) {
      clearTimeout(holdTimeout.current);
      holdTimeout.current = null;
    }

    // Return button to normal size
    Animated.spring(buttonScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    // Shrink the overlay rapidly if let go early
    Animated.timing(holdAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const toggleEmergency = () => {
    // Reset the animation immediately
    Animated.timing(holdAnim, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    }).start();

    Animated.spring(buttonScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    setIsActivated(prev => {
      const newState = !prev;
      if (newState) {
        Alert.alert("EMERGENCY TRIGGERED", "Your emergency contacts have been notified.");
      } else {
        Alert.alert("EMERGENCY CANCELLED", "Your SOS has been deactivated.");
      }
      return newState;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonWrapper}>
        <Animated.View 
          style={[
            styles.pulseRing, 
            { 
              transform: [{ scale }],
              opacity: opacity,
              backgroundColor: isActivated ? '#7F1D1D' : Colors.primary
            }
          ]} 
        />
        <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
          <TouchableOpacity 
            style={[styles.buttonInner, isActivated && { backgroundColor: '#7F1D1D' }]}
            activeOpacity={1}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <Animated.View 
              style={[
                styles.holdOverlay, 
                { 
                  transform: [{ scale: chargeScale }],
                  opacity: chargeOpacity,
                  backgroundColor: isActivated ? Colors.primary : 'rgba(0, 0, 0, 0.4)'
                }
              ]} 
            />
            <Ionicons name={isActivated ? "close-circle-outline" : "warning-outline"} size={50} color={Colors.white} style={{ zIndex: 1 }} />
            <Text style={[styles.sosText, { zIndex: 1, fontSize: isActivated ? 24 : 32 }]}>{isActivated ? "CANCEL" : "SOS"}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      <Text style={[styles.helpText, isActivated && styles.helpTextActive]}>
        {isActivated ? "HOLD TO CANCEL EMERGENCY" : "HOLD TO TRIGGER EMERGENCY"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 30,
    backgroundColor: Colors.background,
  },
  buttonWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.primary,
  },
  buttonInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...Shadows.sos,
  },
  holdOverlay: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  sosText: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 5,
    letterSpacing: 2,
  },
  helpText: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  helpTextActive: {
    color: Colors.primary,
  },
});
