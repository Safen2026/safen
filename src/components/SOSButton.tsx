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
import { useAlertContext } from '../context/AlertContext';
import type { AlertResult } from '../hooks/useAlert';
import { ActiveSOSModal } from './ActiveSOSModal';
import { showToast } from '../utils/toast';
import { Shadows } from '../constants/Theme';

// ─── Slider geometry ────────────────────────────────────────────────────────
const CARD_HEIGHT  = 80;
const PADDING      = 10;
const THUMB_SIZE   = 56;                                          // slightly smaller than before
const CARD_WIDTH   = Dimensions.get('window').width - 32;
const SWIPE_RANGE  = CARD_WIDTH - THUMB_SIZE - PADDING * 2;
const TRIGGER_AT   = SWIPE_RANGE * 0.72;
// ────────────────────────────────────────────────────────────────────────────

export const SOSButton = React.memo(() => {
  const { loading, activeAlert, triggerAlert, cancelAlert } = useAlertContext();
  const isActivated = !!activeAlert;

  const pan          = useRef(new Animated.Value(0)).current;
  const thumbBreath  = useRef(new Animated.Value(1)).current;
  const textShimmer  = useRef(new Animated.Value(0.85)).current;

  // Pulse — all useNativeDriver:false so they share translateX with pan
  const pulseScale1  = useRef(new Animated.Value(1)).current;
  const pulseOpacity1= useRef(new Animated.Value(0.55)).current;
  const pulseScale2  = useRef(new Animated.Value(1)).current;
  const pulseOpacity2= useRef(new Animated.Value(0.35)).current;

  const ch1 = useRef(new Animated.Value(0.25)).current;
  const ch2 = useRef(new Animated.Value(0.25)).current;
  const ch3 = useRef(new Animated.Value(0.25)).current;

  const [smsMode, setSmsMode] = useState(false);

  // ── Animations ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isActivated) return;

    const breathAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(thumbBreath, { toValue: 1.06, duration: 900,  easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(thumbBreath, { toValue: 1.0,  duration: 900,  easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );

    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(textShimmer, { toValue: 1.0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(textShimmer, { toValue: 0.8, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );

    const createChevronSeq = (val: Animated.Value, delayMs: number) =>
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(val, { toValue: 1,    duration: 230, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(val, { toValue: 0.25, duration: 230, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(Math.max(0, 680 - delayMs)),
      ]);

    const chevronLoop = Animated.loop(
      Animated.parallel([
        createChevronSeq(ch1, 0),
        createChevronSeq(ch2, 175),
        createChevronSeq(ch3, 350),
      ])
    );

    // Two-ring pulse — ring 2 is offset so they alternate, giving a richer effect
    const pulse1 = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale1,   { toValue: 2.4,  duration: 700,  easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseScale1,   { toValue: 1,    duration: 0,    useNativeDriver: false }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity1, { toValue: 0,    duration: 700,  useNativeDriver: false }),
          Animated.timing(pulseOpacity1, { toValue: 0.55, duration: 0,    useNativeDriver: false }),
        ]),
      ])
    );

    const pulse2 = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(350),
          Animated.timing(pulseScale2,   { toValue: 2.4,  duration: 700,  easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseScale2,   { toValue: 1,    duration: 0,    useNativeDriver: false }),
        ]),
        Animated.sequence([
          Animated.delay(350),
          Animated.timing(pulseOpacity2, { toValue: 0,    duration: 700,  useNativeDriver: false }),
          Animated.timing(pulseOpacity2, { toValue: 0.35, duration: 0,    useNativeDriver: false }),
        ]),
      ])
    );

    breathAnim.start();
    shimmerAnim.start();
    chevronLoop.start();
    pulse1.start();
    pulse2.start();

    return () => {
      breathAnim.stop();
      shimmerAnim.stop();
      chevronLoop.stop();
      pulse1.stop();
      pulse2.stop();
    };
  }, [isActivated, thumbBreath, textShimmer, ch1, ch2, ch3,
      pulseScale1, pulseOpacity1, pulseScale2, pulseOpacity2]);

  useEffect(() => {
    if (!loading) {
      Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
    }
  }, [loading, pan]);

  const handleCancelAlert = useCallback(async () => {
    const success = await cancelAlert();
    if (success) {
      showToast({ title: 'SOS Cancelled', subtitle: 'Your contacts have been updated.' });
    }
    return success;
  }, [cancelAlert]);

  const handleTrigger = async () => {
    Vibration.vibrate([0, 300, 100, 300]);
    const result: AlertResult = await triggerAlert('sos');
    if (result === 'ok') {
      setSmsMode(false);
    } else if (result === 'sms') {
      setSmsMode(true);
    } else if (result === 'no_contacts') {
      Alert.alert('No Contacts Available Offline',
        'You are offline and no emergency contacts were found in your local cache.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('SOS Failed', 'Could not activate SOS. Please try again.');
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        !isActivated && !loading && Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          if (g.dx <= SWIPE_RANGE) {
            pan.setValue(g.dx);
          } else {
            const excess = g.dx - SWIPE_RANGE;
            const maxOverdrag = 6;
            pan.setValue(SWIPE_RANGE + (maxOverdrag * (1 - Math.exp(-excess / 30))));
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
    outputRange: ['#bb1616', '#4f0101'],
    extrapolate: 'clamp',
  });

  // Pulse rings translate WITH the thumb
  const thumbCentre = PADDING + THUMB_SIZE / 2;
  const pulseSize   = THUMB_SIZE + 6; // same base size as thumb, grows via scale

  return (
    <View style={styles.wrapper}>
      <ActiveSOSModal
        visible={isActivated}
        alertId={activeAlert?.id || ''}
        smsMode={smsMode}
        onCancel={handleCancelAlert}
      />

      <Animated.View style={[styles.track, { backgroundColor: trackBgColor }]} aria-busy={loading}>

        {/* Pulse ring 1 — moves with thumb via translateX: pan */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: PADDING + THUMB_SIZE / 2 - pulseSize / 2,
            top:  PADDING + THUMB_SIZE / 2 - pulseSize / 2,
            width:  pulseSize,
            height: pulseSize,
            borderRadius: pulseSize / 2,
            backgroundColor: '#E02B2B',
            transform: [{ translateX: pan }, { scale: pulseScale1 }],
            opacity: pulseOpacity1,
            zIndex: 2,
          }}
        />

        {/* Pulse ring 2 — offset start */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: PADDING + THUMB_SIZE / 2 - pulseSize / 2,
            top:  PADDING + THUMB_SIZE / 2 - pulseSize / 2,
            width:  pulseSize,
            height: pulseSize,
            borderRadius: pulseSize / 2,
            backgroundColor: '#E02B2B',
            transform: [{ translateX: pan }, { scale: pulseScale2 }],
            opacity: pulseOpacity2,
            zIndex: 2,
          }}
        />

        {/* Thumb */}
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
            if (event.nativeEvent.actionName === 'activate') handleTrigger();
          }}
        >
          {/* Radial highlight — simulates dome/3D pop-out */}
          <View style={styles.thumbHighlight} />

          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.thumbText}>SOS</Text>
          }
        </Animated.View>

        {/* Swipe label */}
        <Animated.View
          style={[
            styles.textContainer,
            { opacity: loading ? textShimmer : Animated.multiply(textOpacity, textShimmer) },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.swipeText}>
            {loading ? 'Activating...' : 'Swipe to Trigger SOS'}
          </Text>
        </Animated.View>

        {/* Chevron arrows */}
        {!loading && (
          <View style={styles.chevrons} pointerEvents="none">
            <Animated.View style={{ opacity: ch1 }}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(127,29,29,0.5)" />
            </Animated.View>
            <Animated.View style={[styles.chevronOverlap, { opacity: ch2 }]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(127,29,29,0.5)" />
            </Animated.View>
            <Animated.View style={[styles.chevronOverlap, { opacity: ch3 }]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(127,29,29,0.5)" />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
  },
  track: {
    height: CARD_HEIGHT,
    borderRadius: 16,
    padding: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.sos,
  },
  thumb: {
    width:  THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderColor: '#941111',
    borderWidth: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: PADDING,
    zIndex: 3,
    backgroundColor: '#880d0fa3',   // deep red base
    overflow: 'hidden',
    // Strong shadow = pop-out depth
    shadowColor: '#420404',
    shadowOffset: { width: 3, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
    elevation: 7,
  },
  thumbHighlight: {
    position: 'absolute',
    top: 15,
    left: 9,
    width:  THUMB_SIZE * 0.6,
    height: THUMB_SIZE * 0.32,
    borderRadius: THUMB_SIZE * 0.18,
    backgroundColor: 'rgba(82, 10, 10, 0.28)',
    transform: [{ rotate: '-18deg' }],
  },
  thumbText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 1, height: 4 },
    textShadowRadius: 2,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  swipeText: {
    color: '#ffffff',
    fontSize: 17,
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