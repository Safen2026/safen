import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Vibration,
  TouchableOpacity,
  Alert,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAlert } from '../hooks/useAlert';
import { useTheme } from '../context/ThemeContext';
import { ConfirmationModal } from './ConfirmationModal';
import { Shadows } from '../constants/Theme';

// ─── Slider geometry ────────────────────────────────────────────────────────
const CARD_HEIGHT  = 80;
const PADDING      = 8;
const THUMB_SIZE   = CARD_HEIGHT - PADDING * 2;
const CARD_WIDTH   = Dimensions.get('window').width - 32; // 16px margin each side
const SWIPE_RANGE  = CARD_WIDTH - THUMB_SIZE - PADDING * 2;
const TRIGGER_AT   = SWIPE_RANGE * 0.72; // 72% across = confirmed swipe
// ────────────────────────────────────────────────────────────────────────────

export const SOSButton = () => {
  const { colors }  = useTheme();
  const { loading, activeAlert, triggerAlert, cancelAlert } = useAlert();
  const isActivated = !!activeAlert;

  const pan         = useRef(new Animated.Value(0)).current;
  const activePulse = useRef(new Animated.Value(1)).current;
  const thumbBreath = useRef(new Animated.Value(1)).current;
  const textShimmer = useRef(new Animated.Value(0.85)).current;

  // Balanced 3-step sequential runway light for the chevrons
  const ch1 = useRef(new Animated.Value(0.25)).current;
  const ch2 = useRef(new Animated.Value(0.25)).current;
  const ch3 = useRef(new Animated.Value(0.25)).current;

  const [confirmModal, setConfirmModal] = useState({
    visible : false,
    title   : '',
    msg     : '',
    icon    : 'warning',
    color   : '#E02B2B',
  });

  // ── Pulse animation while SOS is ACTIVE ──────────────────────────────────
  useEffect(() => {
    if (!isActivated) {
      activePulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activePulse, {
          toValue: 1.04,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(activePulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActivated, activePulse]);

  // ── Idle breathing & balanced chevron wave animations ────────────────────
  useEffect(() => {
    if (isActivated) return;

    // 1. SOS thumb gentle breathing scale
    const breathAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(thumbBreath, {
          toValue: 1.05,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(thumbBreath, {
          toValue: 1.0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    // 2. Subtle text shimmer pulse
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(textShimmer, {
          toValue: 1.0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(textShimmer, {
          toValue: 0.8,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    // 3. Balanced, natural runway light wave (1 -> 2 -> 3)
    const createChevronSequence = (val: Animated.Value, delayMs: number) => {
      return Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(val, {
          toValue: 1,
          duration: 230,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(val, {
          toValue: 0.25,
          duration: 230,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.delay(Math.max(0, 680 - delayMs)),
      ]);
    };

    const chevronLoop = Animated.loop(
      Animated.parallel([
        createChevronSequence(ch1, 0),
        createChevronSequence(ch2, 175),
        createChevronSequence(ch3, 350),
      ])
    );

    breathAnim.start();
    shimmerAnim.start();
    chevronLoop.start();

    return () => {
      breathAnim.stop();
      shimmerAnim.stop();
      chevronLoop.stop();
    };
  }, [isActivated, thumbBreath, textShimmer, ch1, ch2, ch3]);

  // ── Reset slider after any loading cycle ────────────────────────────────
  useEffect(() => {
    if (!loading) {
      Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
    }
  }, [loading, pan]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleTrigger = async () => {
    Vibration.vibrate([0, 300, 100, 300]);
    const triggered = await triggerAlert('sos');
    if (triggered) {
      setConfirmModal({
        visible : true,
        title   : 'SOS TRIGGERED',
        msg     : 'Your emergency contacts have been notified with your live location.',
        icon    : 'warning',
        color   : '#E02B2B',
      });
    } else {
      Alert.alert('Error', 'Could not send SOS. Please check your connection and try again.');
    }
  };

  const handleCancel = async () => {
    const cancelled = await cancelAlert();
    if (cancelled) {
      setConfirmModal({
        visible : true,
        title   : 'SOS CANCELLED',
        msg     : 'Your SOS has been deactivated. Your contacts have been informed.',
        icon    : 'checkmark-circle',
        color   : '#00875A',
      });
    } else {
      Alert.alert('Error', 'Could not cancel SOS. Please try again.');
    }
  };

  // ── Swipe gesture ────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isActivated && !loading,
      onMoveShouldSetPanResponder:  () => !isActivated && !loading,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0 && g.dx <= SWIPE_RANGE) pan.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx >= TRIGGER_AT) {
          Animated.spring(pan, { toValue: SWIPE_RANGE, useNativeDriver: false })
            .start(handleTrigger);
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  // Swipe drag opacity for text (fades smoothly away as thumb slides over)
  const textOpacity = pan.interpolate({
    inputRange: [0, TRIGGER_AT * 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Track background color deepens as user swipes closer to trigger
  const trackBgColor = pan.interpolate({
    inputRange: [0, SWIPE_RANGE],
    outputRange: ['#C0392B', '#991B1B'],
    extrapolate: 'clamp',
  });

  // ── Active state ─────────────────────────────────────────────────────────
  if (isActivated) {
    return (
      <View style={styles.wrapper}>
        <Animated.View style={[styles.activeCard, { transform: [{ scale: activePulse }] }]}>
          <View style={styles.activeLeft}>
            <View style={styles.sosCircle}>
              <Text style={styles.sosCircleText}>SOS</Text>
            </View>
            <Text style={styles.activeLabel}>SOS ACTIVE</Text>
          </View>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={loading}
            accessibilityLabel="Cancel SOS"
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.cancelBtnText}>Cancel</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        <ConfirmationModal
          visible={confirmModal.visible}
          title={confirmModal.title}
          message={confirmModal.msg}
          iconName={confirmModal.icon}
          iconColor={confirmModal.color}
          onClose={() => setConfirmModal(p => ({ ...p, visible: false }))}
        />
      </View>
    );
  }

  // ── Default (idle) state ─────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.track, { backgroundColor: trackBgColor }]}>
        {/* Draggable thumb with smooth breathing pulse — pure circle without border artifact */}
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [
                { translateX: pan },
                { scale: thumbBreath },
              ],
            },
          ]}
          {...panResponder.panHandlers}
          accessibilityLabel="Swipe right to trigger SOS"
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.thumbText}>SOS</Text>
          }
        </Animated.View>

        {/* Centre label with drag fade & gentle idle shimmer */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: Animated.multiply(textOpacity, textShimmer),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.swipeText}>
            {loading ? 'Activating...' : 'Swipe to Trigger SOS'}
          </Text>
        </Animated.View>

        {/* Balanced Sequential Runway Light Chevrons */}
        {!loading && (
          <View style={styles.chevrons} pointerEvents="none">
            <Animated.View style={{ opacity: ch1 }}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
            <Animated.View style={{ opacity: ch2, marginLeft: -6 }}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
            <Animated.View style={{ opacity: ch3, marginLeft: -6 }}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
          </View>
        )}
      </Animated.View>

      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.msg}
        iconName={confirmModal.icon}
        iconColor={confirmModal.color}
        onClose={() => setConfirmModal(p => ({ ...p, visible: false }))}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 22,
  },

  // Idle slider track
  track: {
    height: CARD_HEIGHT,
    borderRadius: 14,
    padding: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.sos,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: PADDING,
    zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1.2,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  swipeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chevrons: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },

  // Active state
  activeCard: {
    height: CARD_HEIGHT,
    backgroundColor: '#991B1B',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    ...Shadows.sos,
  },
  activeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sosCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosCircleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activeLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});