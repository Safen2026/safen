import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Vibration,
  Alert,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAlert, AlertResult } from '../hooks/useAlert';
import { ActiveSOSModal } from './ActiveSOSModal';
import { showToast } from '../utils/toast';
import { Shadows } from '../constants/Theme';

// ─── Slider geometry ────────────────────────────────────────────────────────
const CARD_HEIGHT  = 80;
const PADDING      = 8;
const THUMB_SIZE   = CARD_HEIGHT - PADDING * 2;
const CARD_WIDTH   = Dimensions.get('window').width - 32; // 16px margin each side
const SWIPE_RANGE  = CARD_WIDTH - THUMB_SIZE - PADDING * 2;
const TRIGGER_AT   = SWIPE_RANGE * 0.72; // 72% across = confirmed swipe
// ────────────────────────────────────────────────────────────────────────────

export const SOSButton = React.memo(() => {
  const { loading, activeAlert, triggerAlert, cancelAlert } = useAlert();
  const isActivated = !!activeAlert;

  const pan         = useRef(new Animated.Value(0)).current;
  const thumbBreath = useRef(new Animated.Value(1)).current;
  const textShimmer = useRef(new Animated.Value(0.85)).current;
  
  const ch1 = useRef(new Animated.Value(0.25)).current;
  const ch2 = useRef(new Animated.Value(0.25)).current;
  const ch3 = useRef(new Animated.Value(0.25)).current;

  const [smsMode, setSmsMode] = useState(false);

  // ── Idle breathing & balanced chevron wave animations ────────────────────
  useEffect(() => {
    if (isActivated) return;

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

  const handleCancelAlert = useCallback(async () => {
    const success = await cancelAlert();
    if (success) {
      showToast({
        title: 'SOS Cancelled',
        subtitle: 'Your contacts have been updated.',
      });
    }
    return success;
  }, [cancelAlert]);



  // ── Handlers ────────────────────────────────────────────────────────────
  const handleTrigger = async () => {
    Vibration.vibrate([0, 300, 100, 300]);
    const result: AlertResult = await triggerAlert('sos');

    if (result === 'ok') {
      setSmsMode(false);
    } else if (result === 'sms') {
      setSmsMode(true);
    } else {
      Alert.alert('SOS Failed', 'Could not activate SOS. Please try again.');
    }
  };

  // ── Swipe gesture ────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // Don't block normal taps
      onMoveShouldSetPanResponder: (_, g) => {
        // Gesture Lock: Only capture gesture if it is horizontally dominant and moved > 5px.
        // This prevents iOS Native ScrollView from fighting the gesture, fixing the sluggishness.
        return !isActivated && !loading && Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy);
      },
      onPanResponderTerminationRequest: () => false, // Refuse to surrender gesture to iOS Native components
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          if (g.dx <= SWIPE_RANGE) {
            pan.setValue(g.dx);
          } else {
            // Apply rubber-banding friction that maxes out at 6px over-drag
            // so it never gets clipped by the track's overflow: 'hidden'
            const excess = g.dx - SWIPE_RANGE;
            const maxOverdrag = 6;
            const rubberBandedValue = SWIPE_RANGE + (maxOverdrag * (1 - Math.exp(-excess / 30)));
            pan.setValue(rubberBandedValue);
          }
        }
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

  const textOpacity = pan.interpolate({
    inputRange: [0, TRIGGER_AT * 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const trackBgColor = pan.interpolate({
    inputRange: [0, SWIPE_RANGE],
    outputRange: ['#C0392B', '#991B1B'],
    extrapolate: 'clamp',
  });

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      <ActiveSOSModal
        visible={isActivated}
        alertId={activeAlert?.id || ''}
        smsMode={smsMode}
        onCancel={handleCancelAlert}
      />

      <Animated.View style={[styles.track, { backgroundColor: trackBgColor }]} aria-busy={loading}>
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
          accessibilityHint="Double tap to trigger SOS immediately"
          accessibilityActions={[{ name: 'activate', label: 'Trigger SOS' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate') {
              handleTrigger();
            }
          }}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.thumbText}>SOS</Text>
          }
        </Animated.View>

        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: loading ? textShimmer : Animated.multiply(textOpacity, textShimmer),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.swipeText}>
            {loading ? 'Activating...' : 'Swipe to Trigger SOS'}
          </Text>
        </Animated.View>

        {!loading && (
          <View style={styles.chevrons} pointerEvents="none">
            <Animated.View style={{ opacity: ch1 }}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
            <Animated.View style={[styles.chevronOverlap, { opacity: ch2 }]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
            <Animated.View style={[styles.chevronOverlap, { opacity: ch3 }]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
            </Animated.View>
          </View>
        )}
      </Animated.View>

    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 22,
  },
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
  chevronOverlap: {
    marginLeft: -6,
  },
});