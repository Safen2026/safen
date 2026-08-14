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
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert, AlertResult } from '../hooks/useAlert';
import { useEmergencyRecording } from '../hooks/useEmergencyRecording';
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
  const insets = useSafeAreaInsets();
  const { loading, activeAlert, triggerAlert, cancelAlert } = useAlert();
  const isActivated = !!activeAlert;
  const {
    isRecording,
    phase,
    durationSeconds,
    startRecording,
    stopRecording,
    bindCameraRef,
  } = useEmergencyRecording();

  // Start recording once when an alert becomes active.
  // We intentionally do NOT include isRecording or stopRecording here —
  // that would cause a restart loop when the user cancels.
  const startedForRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (activeAlert?.id && startedForRef.current !== activeAlert.id) {
      startedForRef.current = activeAlert.id;
      startRecording(activeAlert.id);
    }
    if (!activeAlert) {
      startedForRef.current = null;
    }
  }, [activeAlert?.id]);

  const pan         = useRef(new Animated.Value(0)).current;
  const activePulse = useRef(new Animated.Value(1)).current; // For backward compatibility if needed elsewhere
  const thumbBreath = useRef(new Animated.Value(1)).current;
  const textShimmer = useRef(new Animated.Value(0.85)).current;
  
  // Radar sonar waves for active screen
  const sonar1 = useRef(new Animated.Value(0)).current;
  const sonar2 = useRef(new Animated.Value(0)).current;
  const sonar3 = useRef(new Animated.Value(0)).current;

  // Staggered slide-in entrance for checklist items
  const rowAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

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

  // True when SOS was fired via SMS fallback (no internet)
  const [smsMode, setSmsMode] = useState(false);

  // ── Sonar Pulse animation while SOS is ACTIVE ──────────────────────────────────
  useEffect(() => {
    if (!isActivated) {
      sonar1.setValue(0);
      sonar2.setValue(0);
      sonar3.setValue(0);
      rowAnims.forEach(anim => anim.setValue(0));
      return;
    }

    // Trigger staggered slide-in for checklist
    rowAnims.forEach(anim => anim.setValue(0));
    Animated.stagger(
      75,
      rowAnims.map(anim =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.back(1.05)),
          useNativeDriver: true,
        })
      )
    ).start();

    const createRipple = (animValue: Animated.Value) => {
      animValue.setValue(0);
      return Animated.loop(
        Animated.timing(animValue, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      );
    };

    const s1 = createRipple(sonar1);
    const s2 = createRipple(sonar2);
    const s3 = createRipple(sonar3);

    s1.start();
    const t1 = setTimeout(() => s2.start(), 800);
    const t2 = setTimeout(() => s3.start(), 1600);

    return () => {
      s1.stop();
      s2.stop();
      s3.stop();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isActivated, sonar1, sonar2, sonar3]);

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
    const result: AlertResult = await triggerAlert('sos');

    if (result === 'ok') {
      setSmsMode(false);
      setConfirmModal({
        visible : true,
        title   : 'SOS TRIGGERED',
        msg     : 'Your emergency contacts have been notified with your live location.',
        icon    : 'warning',
        color   : '#E02B2B',
      });
    } else if (result === 'sms') {
      // Offline fallback — native SMS composer has opened
      setSmsMode(true);
      setConfirmModal({
        visible : true,
        title   : 'SMS SENT (OFFLINE)',
        msg     : 'No internet detected. A pre-filled SOS message has been opened in your SMS app for your emergency contacts.',
        icon    : 'chatbubble-ellipses',
        color   : '#D97706',
      });
    } else {
      Alert.alert(
        'Could not send SOS',
        'Please check your connection and try again, or call emergency services directly.',
      );
    }
  };

  const handleCancel = async () => {
    // Stop recording first (synchronous gate flip)
    stopRecording();
    
    // Give the camera a brief moment to flush the video recording to disk 
    // and resolve its promise before we unmount the CameraView component!
    // Without this, the video chunk is lost on cancel.
    setTimeout(async () => {
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
    }, 500);
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
    const isVideoPhase = phase === 'recording_video_audio';

    // Overall elapsed timer (always counts up)
    const totalMins = Math.floor(durationSeconds / 60);
    const totalSecs = (durationSeconds % 60).toString().padStart(2, '0');
    const timerStr = `${totalMins.toString().padStart(2, '0')}:${totalSecs}`;

    // Video timer: counts 0–60 during video phase, then freezes at 1:00
    const videoElapsed = Math.min(durationSeconds, 60);
    const videoMins = Math.floor(videoElapsed / 60);
    const videoSecs = (videoElapsed % 60).toString().padStart(2, '0');
    const videoTimerStr = `${videoMins.toString().padStart(2, '0')}:${videoSecs}`;

    // Audio timer: only counts after the 60s video phase
    const audioElapsed = Math.max(0, durationSeconds - 60);
    const audioMins = Math.floor(audioElapsed / 60);
    const audioSecs = (audioElapsed % 60).toString().padStart(2, '0');
    const audioTimerStr = `${audioMins.toString().padStart(2, '0')}:${audioSecs}`;

    return (
      <Modal 
        visible={isActivated} 
        animationType="slide" 
        transparent={false} 
        onRequestClose={handleCancel}
        statusBarTranslucent={true}
      >
        <View style={styles.modalContainer}>
          {/* Hidden CameraView - Important for background video recording on Android */}
          <View style={styles.hiddenCameraContainer}>
            <CameraView
              ref={bindCameraRef}
              style={{ width: 10, height: 10 }}
              facing="back"
              mode="video"
              onCameraReady={() => {}}
            />
          </View>

          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ 
              paddingTop: Math.max(insets.top, 16), 
              paddingBottom: Math.max(insets.bottom, 24),
              flexGrow: 1 
            }}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCancel} accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalHeaderText}>EMERGENCY SOS</Text>
            <TouchableOpacity>
              <MaterialCommunityIcons name="shield-plus-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Main Pulsing Area */}
          <View style={styles.pulseContainer}>
            <View style={styles.sonarContainer}>
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
              }]} />
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar2.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
              }]} />
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar3.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar3.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
              }]} />
              
              <View style={styles.sosCircle}>
                <Text style={styles.sosCircleText}>SOS</Text>
              </View>
            </View>
            
            <Text style={styles.alertingText}>Alerting your network...</Text>
            <Text style={styles.timerText}>{timerStr}</Text>
          </View>

          {/* Help Banner */}
          <View style={styles.helpBanner}>
            <Ionicons name="radio-outline" size={32} color="#E74C3C" style={{ marginRight: 16 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.helpBannerTitle}>Help is on the way!</Text>
              <Text style={styles.helpBannerSub}>Your location and details have been shared with your contacts and authorities.</Text>
            </View>
          </View>

          {/* Checklist */}
          <View style={styles.checklistContainer}>
            {/* Location */}
            <Animated.View style={[
              styles.checklistItem,
              {
                opacity: rowAnims[0],
                transform: [{
                  translateY: rowAnims[0].interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
                }]
              }
            ]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: '#27AE60' }]}>
                <Ionicons name="location" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Location Shared</Text>
              </View>
              <Ionicons name="checkmark" size={24} color="#27AE60" />
            </Animated.View>

            {/* SMS */}
            <Animated.View style={[
              styles.checklistItem,
              {
                opacity: rowAnims[1],
                transform: [{
                  translateY: rowAnims[1].interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
                }]
              }
            ]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: smsMode ? '#D97706' : '#2980B9' }]}>
                <Ionicons name={smsMode ? 'chatbubble-ellipses' : 'chatbubble'} size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>
                  {smsMode ? 'SMS Fallback Opened' : 'SMS Alerts Sent'}
                </Text>
                <Text style={styles.checklistSub}>
                  {smsMode ? 'No internet — SMS composer opened' : 'To your trusted contacts'}
                </Text>
              </View>
              {smsMode
                ? <Ionicons name="warning" size={22} color="#D97706" />
                : <Ionicons name="checkmark" size={24} color="#27AE60" />
              }
            </Animated.View>

            {/* Authorities */}
            <Animated.View style={[
              styles.checklistItem,
              {
                opacity: rowAnims[2],
                transform: [{
                  translateY: rowAnims[2].interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
                }]
              }
            ]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: '#8E44AD' }]}>
                <Ionicons name="shield" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Authorities Notified</Text>
                <Text style={styles.checklistSub}>Local security & Police</Text>
              </View>
              <Ionicons name="checkmark" size={24} color="#27AE60" />
            </Animated.View>

            {/* Video Clip */}
            <Animated.View style={[
              styles.checklistItem,
              {
                opacity: rowAnims[3],
                transform: [{
                  translateY: rowAnims[3].interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
                }]
              }
            ]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: isVideoPhase ? '#C0392B' : '#27AE60' }]}>
                <Ionicons name={isVideoPhase ? 'videocam' : 'videocam-outline'} size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Video Clip</Text>
                <Text style={styles.checklistSub}>
                  {isVideoPhase ? 'Recording...' : 'Uploaded ✓'}
                </Text>
              </View>
              {isVideoPhase
                ? <Text style={styles.checklistTimer}>{videoTimerStr}</Text>
                : <Ionicons name="checkmark" size={24} color="#27AE60" />
              }
            </Animated.View>

            {/* Audio */}
            <Animated.View style={[
              styles.checklistItem,
              {
                opacity: rowAnims[4],
                transform: [{
                  translateY: rowAnims[4].interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
                }]
              }
            ]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: isVideoPhase ? '#555' : '#E67E22' }]}>
                <Ionicons name="mic" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={[styles.checklistTitle, isVideoPhase && { color: '#777' }]}>Audio Recording</Text>
                <Text style={styles.checklistSub}>
                  {isVideoPhase ? 'Starts after video...' : 'Recording in progress...'}
                </Text>
              </View>
              {!isVideoPhase && <Text style={styles.checklistTimer}>{audioTimerStr}</Text>}
            </Animated.View>
          </View>

          <View style={{ flex: 1 }} />

          {/* Cancel Button */}
          <TouchableOpacity 
            style={styles.modalCancelBtn} 
            onPress={handleCancel}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#E74C3C" /> : <Text style={styles.modalCancelBtnText}>Cancel SOS</Text>}
          </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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

  // Active state Modal UI
  modalContainer: {
    flex: 1,
    backgroundColor: '#0b0c10',
  },
  hiddenCameraContainer: {
    position: 'absolute',
    width: 10,
    height: 10,
    overflow: 'hidden',
    opacity: 0.01,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  modalHeaderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  pulseContainer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 40,
  },
  sonarContainer: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sonarRipple: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E74C3C',
  },
  sosCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#E74C3C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  sosCircleText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 2,
  },
  alertingText: {
    color: '#ccc',
    fontSize: 15,
    marginTop: 32,
    marginBottom: 12,
  },
  timerText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  helpBanner: {
    marginHorizontal: 20,
    borderColor: '#E74C3C',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(231,76,60,0.05)',
    marginBottom: 24,
    alignItems: 'center',
  },
  helpBannerTitle: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  helpBannerSub: {
    color: '#999',
    fontSize: 13,
    lineHeight: 18,
  },
  checklistContainer: {
    paddingHorizontal: 20,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  checklistIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  checklistTextContainer: {
    flex: 1,
  },
  checklistTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  checklistSub: {
    color: '#888',
    fontSize: 12,
  },
  checklistTimer: {
    color: '#E74C3C',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCancelBtn: {
    marginHorizontal: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E74C3C',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(231,76,60,0.05)',
  },
  modalCancelBtnText: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});