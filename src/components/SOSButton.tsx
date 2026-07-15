import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, ActivityIndicator, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Shadows } from '../constants/Theme';
import { useTheme } from '../context/ThemeContext';
import { ConfirmationModal } from './ConfirmationModal';
import { useAlert } from '../hooks/useAlert';

export const SOSButton = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const { loading, activeAlert, triggerAlert, cancelAlert } = useAlert();
  const isActivated = !!activeAlert;

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef(new Animated.Value(isActivated ? 1 : 0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  
  const tapCount = useRef(0);
  const resetTimeout = useRef<any>(null);

  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: '',
    msg: '',
    icon: 'warning',
    color: colors.primary
  });

  useEffect(() => {
    // Keep holdAnim in sync if external status changes
    Animated.timing(holdAnim, { toValue: isActivated ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [isActivated]);

  useEffect(() => {
    if (pulseLoop.current) pulseLoop.current.stop();
    pulseAnim.setValue(0);
    pulseLoop.current = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: isActivated ? 300 : 2000,
        useNativeDriver: true,
      })
    );
    pulseLoop.current.start();
    return () => { if (pulseLoop.current) pulseLoop.current.stop(); };
  }, [isActivated, pulseAnim]);

  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, isActivated ? 1.2 : 1.5] });
  const opacity = pulseAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [isActivated ? 0.8 : 0.6, 0.2, 0] });
  const chargeScale = holdAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const chargeOpacity = holdAnim.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] });

  const handlePress = () => {
    if (loading || tapCount.current >= 3) return;
    
    // Visual feedback for the tap
    buttonScaleAnim.setValue(0.9);
    Animated.spring(buttonScaleAnim, { toValue: 1, useNativeDriver: true }).start();
    Vibration.vibrate(50); // Light haptic click on each tap

    tapCount.current += 1;

    const finalValue = isActivated ? 0 : 1;

    if (tapCount.current >= 3) {
      if (resetTimeout.current) clearTimeout(resetTimeout.current);
      // Fast timing to finalValue to show the final charge hitting the edges
      Animated.timing(holdAnim, { toValue: finalValue, duration: 150, useNativeDriver: true }).start(() => {
        tapCount.current = 0;
        handleToggle();
      });
    } else {
      // Calculate how full the circle should be (0 to 1)
      const targetValue = isActivated ? (1 - (tapCount.current / 3)) : (tapCount.current / 3);
      Animated.spring(holdAnim, { toValue: targetValue, useNativeDriver: true }).start();

      if (resetTimeout.current) clearTimeout(resetTimeout.current);
      resetTimeout.current = setTimeout(() => {
        tapCount.current = 0;
        Animated.timing(holdAnim, { toValue: isActivated ? 1 : 0, duration: 300, useNativeDriver: true }).start();
      }, 1000);
    }
  };

  const handleToggle = async () => {
    Vibration.vibrate([0, 500, 200, 500]); // Aggressive vibration for final trigger
    
    if (isActivated) {
      const cancelled = await cancelAlert();
      if (cancelled) {
        setConfirmModal({
          visible: true,
          title: "SOS CANCELLED",
          msg: "Your SOS has been deactivated. Responders stood down.",
          icon: "checkmark-circle",
          color: colors.status.safeText
        });
      } else {
        Animated.timing(holdAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        Alert.alert('Error', 'Could not cancel the alert. Please try again.');
      }
    } else {
      const triggered = await triggerAlert('sos');
      if (triggered) {
        setConfirmModal({
          visible: true,
          title: "SOS TRIGGERED",
          msg: "Your emergency contacts have been notified and live location shared.",
          icon: "warning",
          color: colors.primary
        });
      } else {
        Animated.timing(holdAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        Alert.alert('Error', 'Could not send SOS. Please check your connection and try again.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonWrapper}>
        <Animated.View
          style={[styles.pulseRing, { transform: [{ scale }], opacity, backgroundColor: isActivated ? '#7F1D1D' : colors.primary }]}
        />
        <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
          <TouchableOpacity
            style={styles.buttonInner}
            activeOpacity={1}
            onPress={handlePress}
            disabled={loading}
          >
            <Animated.View
              style={[styles.holdOverlay, {
                transform: [{ scale: chargeScale }],
                opacity: chargeOpacity,
                backgroundColor: '#7F1D1D',
              }]}
            />
            {loading ? (
              <ActivityIndicator size="large" color={colors.white} style={{ zIndex: 1 }} />
            ) : (
              <>
                <Ionicons name={isActivated ? 'close-circle-outline' : 'warning-outline'} size={50} color={colors.white} style={{ zIndex: 1 }} />
                <Text style={[styles.sosText, { zIndex: 1, fontSize: isActivated ? 24 : 32 }]}>
                  {isActivated ? 'CANCEL' : 'SOS'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
      <Text style={[styles.helpText, isActivated && styles.helpTextActive]}>
        {loading ? 'PLEASE WAIT...' : isActivated ? 'TAP 3 TIMES TO CANCEL' : 'TAP 3 TIMES FOR EMERGENCY'}
      </Text>

      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.msg}
        iconName={confirmModal.icon}
        iconColor={confirmModal.color}
        onClose={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 30, backgroundColor: colors.background },
  buttonWrapper: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  pulseRing: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  buttonInner: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden', ...Shadows.md,
  },
  holdOverlay: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  sosText: { color: colors.white, fontWeight: 'bold', marginTop: 2, letterSpacing: 2 },
  helpText: { color: colors.text.primary, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  helpTextActive: { color: colors.primary },
});