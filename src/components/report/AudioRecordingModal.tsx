import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '../../constants/Theme';
import { Shadows } from '../../constants/Theme';

interface AudioRecordingModalProps {
  recording: Audio.Recording | null;
  recordingDuration: number;
  pulseAnim: Animated.Value;
  onStop: () => void;
  colors: ThemeColors;
}

const formatDuration = (millis: number) => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const AudioRecordingModal = React.memo(function AudioRecordingModal({
  recording,
  recordingDuration,
  pulseAnim,
  onStop,
  colors
}: AudioRecordingModalProps) {
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(colors, insets.bottom), [colors, insets.bottom]);

  return (
    <Modal
      visible={recording !== null}
      transparent={true}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onStop}
    >
      <View style={styles.recordingOverlay}>
        <View style={styles.recordingCard}>
          <Animated.View style={[styles.recordingPulse, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="mic" size={40} color="#EF4444" />
          </Animated.View>
          <Text style={styles.recordingText}>Recording Audio...</Text>
          <Text style={styles.timerText} accessibilityRole="timer">
            {formatDuration(recordingDuration)}
          </Text>
          
          <TouchableOpacity 
            style={styles.stopRecordingBtn} 
            onPress={onStop} 
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Stop recording audio"
          >
            <View style={styles.stopIcon} />
            <Text style={styles.stopRecordingText}>Stop Recording</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors, bottomInset: number) => StyleSheet.create({
  recordingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  recordingCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 30,
    paddingHorizontal: 30,
    paddingBottom: Math.max(bottomInset + 20, 30),
    alignItems: 'center',
    ...Shadows.md,
  },
  recordingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  recordingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 24,
    fontVariant: ['tabular-nums'],
  },
  stopRecordingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    ...Shadows.sm,
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: '#FFF',
    borderRadius: 3,
    marginRight: 10,
  },
  stopRecordingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
