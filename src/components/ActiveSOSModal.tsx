import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Easing,
  Modal,
  ScrollView,
  Alert
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEmergencyRecording } from '../hooks/useEmergencyRecording';
import { cinematicScroll } from '../utils/scrollUtils';
import { formatDuration } from '../utils/dateUtils';
import { useTheme } from '../context/ThemeContext';
import { CancelSOSModal } from './CancelSOSModal';
import { SOSFeed } from './SOSFeed';

// ─── Props ───────────────────────────────────────────────────────────────────
interface ActiveSOSModalProps {
  visible: boolean;
  alertId: string;
  smsMode: boolean;
  onCancel: () => Promise<boolean>;
}

export const ActiveSOSModal = React.memo(({
  visible,
  alertId,
  smsMode,
  onCancel,
}: ActiveSOSModalProps) => {
  const insets = useSafeAreaInsets();

  const {
    phase,
    durationSeconds,
    startRecording,
    stopRecording,
    bindCameraRef,
  } = useEmergencyRecording();

  const { colors } = useTheme();

  const [loadingCancel, setLoadingCancel] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Only start recording once per alertId
  const startedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (visible && alertId && startedForRef.current !== alertId) {
      startedForRef.current = alertId;
      startRecording(alertId);
    }
    if (!visible) {
      startedForRef.current = null;
    }
  }, [visible, alertId, startRecording]);

  // Radar sonar waves
  const sonar1 = useRef(new Animated.Value(0)).current;
  const sonar2 = useRef(new Animated.Value(0)).current;
  const sonar3 = useRef(new Animated.Value(0)).current;

  // Auto-scroll refs
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  // Staggered slide-in for checklist
  const rowAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!visible) {
      sonar1.setValue(0);
      sonar2.setValue(0);
      sonar3.setValue(0);
      rowAnims.forEach(anim => anim.setValue(0));
      return;
    }

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

    let cancelScroll: (() => void) | null = null;

    // Custom cinematic scroll to prevent native abrupt jump
    const tScroll = setTimeout(() => {
      const maxScroll = contentHeightRef.current - scrollHeightRef.current;
      if (maxScroll > 0) {
        cancelScroll = cinematicScroll(scrollViewRef, maxScroll, 1800);
      }
    }, 500);

    return () => {
      s1.stop();
      s2.stop();
      s3.stop();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tScroll);
      if (cancelScroll) cancelScroll();
    };
  }, [visible, sonar1, sonar2, sonar3, rowAnims]);

  const handleCancelRequest = useCallback(() => {
    setShowCancelModal(true);
  }, []);

  const handleConfirmCancel = useCallback(async () => {
    setLoadingCancel(true);
    stopRecording();

    // Give the camera a brief moment to flush the video to disk
    await new Promise(r => setTimeout(r, 500));

    const cancelled = await onCancel();
    setLoadingCancel(false);

    if (!cancelled) {
      Alert.alert('Error', 'Could not cancel SOS. Please try again.');
    } else {
      setShowCancelModal(false);
    }
  }, [onCancel, stopRecording]);

  const isVideoPhase = phase === 'recording_video_audio';

  const timerStr = formatDuration(durationSeconds);
  const videoTimerStr = formatDuration(Math.min(durationSeconds, 60));
  const audioTimerStr = formatDuration(Math.max(0, durationSeconds - 60));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCancelRequest}
      statusBarTranslucent={true}
    >
      <View style={styles.modalContainer}>
        {/* Hidden CameraView for background video recording */}
        <View style={styles.hiddenCameraContainer}>
          <CameraView
            ref={bindCameraRef}
            style={{ width: 10, height: 10 }}
            facing="back"
            mode="video"
          />
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => { scrollHeightRef.current = e.nativeEvent.layout.height; }}
          onContentSizeChange={(_, h) => { contentHeightRef.current = h; }}
          contentContainerStyle={{
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24),
            flexGrow: 1,
          }}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ width: 28 }} />
            <Text style={styles.modalHeaderText}>EMERGENCY SOS</Text>
            {/* Placeholder to keep header centred */}
            <View style={{ width: 28 }} />
          </View>

          {/* Main Pulsing Area */}
          <View style={styles.pulseContainer} accessibilityRole="alert" aria-live="assertive">
            <View style={styles.sonarContainer} aria-hidden={true}>
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              }]} />
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar2.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              }]} />
              <Animated.View style={[styles.sonarRipple, {
                transform: [{ scale: sonar3.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
                opacity: sonar3.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
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
              <Text style={styles.helpBannerSub}>
                Your location and details have been shared with your emergency contacts.
              </Text>
            </View>
          </View>

          {/* Checklist */}
          <View style={styles.checklistContainer}>
            {/* Location */}
            <Animated.View style={[styles.checklistItem, {
              opacity: rowAnims[0],
              transform: [{ translateY: rowAnims[0].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            }]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: '#27AE60' }]}>
                <Ionicons name="location" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Location Shared</Text>
              </View>
              <Ionicons name="checkmark" size={24} color="#27AE60" />
            </Animated.View>



            {/* Contacts */}
            <Animated.View style={[styles.checklistItem, {
              opacity: rowAnims[1],
              transform: [{ translateY: rowAnims[1].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            }]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: '#8E44AD' }]}>
                <Ionicons name="people" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Contacts Notified</Text>
                <Text style={styles.checklistSub}>Your trusted network</Text>
              </View>
              <Ionicons name="checkmark" size={24} color="#27AE60" />
            </Animated.View>

            {/* Video Clip */}
            <Animated.View style={[styles.checklistItem, {
              opacity: rowAnims[2],
              transform: [{ translateY: rowAnims[2].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            }]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: isVideoPhase ? '#C0392B' : '#27AE60' }]}>
                <Ionicons name={isVideoPhase ? 'videocam' : 'videocam-outline'} size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={styles.checklistTitle}>Video Clip</Text>
                <Text style={styles.checklistSub}>{isVideoPhase ? 'Recording...' : 'Uploaded ✓'}</Text>
              </View>
              {isVideoPhase
                ? <Text style={styles.checklistTimer}>{videoTimerStr}</Text>
                : <Ionicons name="checkmark" size={24} color="#27AE60" />}
            </Animated.View>

            {/* Audio */}
            <Animated.View style={[styles.checklistItem, {
              opacity: rowAnims[3],
              transform: [{ translateY: rowAnims[3].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            }]}>
              <View style={[styles.checklistIconWrapper, { backgroundColor: isVideoPhase ? '#555' : '#E67E22' }]}>
                <Ionicons name="mic" size={16} color="#fff" />
              </View>
              <View style={styles.checklistTextContainer}>
                <Text style={[styles.checklistTitle, isVideoPhase && { color: '#777' }]}>Audio Recording</Text>
                <Text style={styles.checklistSub}>{isVideoPhase ? 'Starts after video...' : 'Recording in progress...'}</Text>
              </View>
              {!isVideoPhase && <Text style={styles.checklistTimer}>{audioTimerStr}</Text>}
            </Animated.View>
          </View>

          {/* Real-time SOS Feed */}
          {alertId ? <SOSFeed alertId={alertId} /> : null}

          <View style={{ flex: 1 }} />

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={handleCancelRequest}
            disabled={loadingCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel SOS"
          >
            <Text style={styles.modalCancelBtnText}>Cancel SOS</Text>
          </TouchableOpacity>
        </ScrollView>

        <CancelSOSModal 
          visible={showCancelModal} 
          loading={loadingCancel} 
          colors={colors} 
          onKeepActive={() => setShowCancelModal(false)} 
          onConfirmCancel={handleConfirmCancel} 
        />
      </View>
    </Modal>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
