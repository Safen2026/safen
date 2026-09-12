import { useState, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { showToast } from '../utils/toast';
import { useHaptics } from '../context/HapticsContext';

export function useReportMedia() {
  const { triggerHaptic } = useHaptics();
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Always tracks the latest recording instance so the unmount cleanup can
  // stop it without the double-unload caused by [recording] deps.
  const recordingRef = useRef<Audio.Recording | null>(null);

  const showError = useCallback((title: string, message: string) => {
    showToast({
      title,
      subtitle: message,
      icon: 'warning',
    });
  }, []);

  const handleTakePhoto = useCallback(async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      showError('Limit Reached', 'You can only attach up to 4 media items per report.');
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission Required', 'Please grant camera access in your device settings to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0].uri) {
      setMediaFiles(prev => [...prev, result.assets[0].uri]);
    }
  }, [mediaFiles.length, showError]);

  const handleRecordVideo = useCallback(async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      showError('Limit Reached', 'You can only attach up to 4 media items per report.');
      return;
    }
    
    const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
    
    if (cameraPerm.status !== 'granted') {
      showError('Permissions Required', 'Please grant camera access in your device settings to record video.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0].uri) {
      setMediaFiles(prev => [...prev, result.assets[0].uri]);
    }
  }, [mediaFiles.length, showError]);

  const handlePickLibrary = useCallback(async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      showError('Limit Reached', 'You can only attach up to 4 media items per report.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission Required', 'Please grant photo gallery access in your device settings.');
      return;
    }

    const maxSelections = 4 - mediaFiles.length;
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: maxSelections,
      quality: 0.7,
    });

    if (!result.canceled) {
      const newUris = result.assets.map(a => a.uri);
      setMediaFiles(prev => [...prev, ...newUris].slice(0, 4));
    }
  }, [mediaFiles.length, showError]);

  const [recordingDuration, setRecordingDuration] = useState(0);

  const startRecording = useCallback(async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      showError('Limit Reached', 'You can only attach up to 4 media items per report.');
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        showError('Permission Required', 'Please grant microphone access in your device settings.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      recordingRef.current = newRecording;
      setRecordingDuration(0);

      newRecording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording) {
          setRecordingDuration(status.durationMillis);
        }
      });
      
      // Start pulse animation and store the reference so we can stop it later.
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } catch {
      showError('Error', 'Failed to start recording.');
    }
  }, [mediaFiles.length, pulseAnim, showError]);

  const stopRecording = useCallback(async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      if (uri) {
        setMediaFiles(prev => [...prev, uri]);
      }
    } catch {
      // Ignore errors if stopped abruptly
    }
    setRecording(null);
    recordingRef.current = null;
    pulseAnim.setValue(1);
    // Stop the exact loop instance created in startRecording.
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
  }, [recording, pulseAnim]);

  // Unmount-only cleanup: releases the microphone if the user navigates away
  // while recording is active. Uses a ref (not state) so this effect runs
  // exactly once and never causes double-unload on a normal stopRecording call.
  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const removeMedia = useCallback((index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearSelectedPreview = useCallback(() => setSelectedPreview(null), []);

  const clearMedia = useCallback(() => {
    setMediaFiles([]);
    setSelectedPreview(null);
  }, []);

  return {
    mediaFiles,
    selectedPreview,
    setSelectedPreview,
    recording,
    recordingDuration,
    pulseAnim,
    showError,
    handleTakePhoto,
    handleRecordVideo,
    handlePickLibrary,
    startRecording,
    stopRecording,
    removeMedia,
    clearSelectedPreview,
    clearMedia,
  };
}
