import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { extractMediaTimestamp } from '../utils/mediaUtils';

export interface EmergencyAudioPlayerProps {
  /** All audio chunk URLs recorded during the SOS, ordered oldest→newest. */
  audioUrls?: string[] | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function formatTime(millis: number): string {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const EmergencyAudioPlayer = React.memo(function EmergencyAudioPlayer({
  audioUrls,
  onRefresh,
  isRefreshing = false,
}: EmergencyAudioPlayerProps) {
  const { colors, isDark } = useTheme();

  // Normalise: always work with a stable array
  const urls = useMemo<string[]>(
    () => (Array.isArray(audioUrls) && audioUrls.length > 0 ? audioUrls : []),
    [audioUrls],
  );

  const totalChunks = urls.length;

  // Active chunk index — start on the first clip so pressing play seamlessly
  // plays through the ambient emergency context in chronological order.
  const [chunkIndex, setChunkIndex] = useState<number>(0);

  // Auto-play next chunk flag
  const shouldAutoPlayRef = useRef(false);

  // Keep live references so callback closures always see latest values
  const chunkIndexRef = useRef(chunkIndex);
  chunkIndexRef.current = chunkIndex;
  const totalChunksRef = useRef(totalChunks);
  totalChunksRef.current = totalChunks;

  const activeUrl = totalChunks > 0 && chunkIndex < totalChunks ? urls[chunkIndex] : null;

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  const isMountedRef = useRef(true);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Pulse animation for active playback or waiting state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Extract real capture timestamp from the Cloudinary public_id (e.g. audio_1730560800000)
  const chunkTimestamp = useMemo(() => {
    if (!activeUrl) return null;
    const date = extractMediaTimestamp(activeUrl);
    if (!date) return null;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [activeUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!isMountedRef.current) return;

    if (!status.isLoaded) {
      if (status.error) {
        console.warn('[EmergencyAudioPlayer] Playback error:', status.error);
        setIsPlaying(false);
        setIsLoading(false);
      }
      return;
    }

    setIsPlaying(status.isPlaying);
    setPositionMillis(status.positionMillis);
    setDurationMillis(status.durationMillis ?? 0);

    if (status.didJustFinish) {
      setPositionMillis(0);

      // Auto-next: If there is a subsequent chunk, automatically advance and play it
      if (chunkIndexRef.current < totalChunksRef.current - 1) {
        shouldAutoPlayRef.current = true;
        setChunkIndex((prev) => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }
  }, []);

  const loadAndPlaySound = useCallback(async (url: string) => {
    if (!url) return;
    try {
      setIsLoading(true);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {});

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      if (!isMountedRef.current) {
        newSound.unloadAsync().catch(() => {});
        return;
      }

      soundRef.current = newSound;
      setSound(newSound);
      setIsLoading(false);
      setIsPlaying(true);
    } catch (err) {
      console.warn('[EmergencyAudioPlayer] Playback load error:', err);
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  }, [onPlaybackStatusUpdate]);

  // Reset and/or auto-play when activeUrl changes (chunk navigation or auto-next)
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setSound(null);
    setPositionMillis(0);
    setDurationMillis(0);

    if (shouldAutoPlayRef.current && activeUrl) {
      shouldAutoPlayRef.current = false;
      void loadAndPlaySound(activeUrl);
    } else {
      setIsPlaying(false);
    }
  }, [activeUrl, loadAndPlaySound]);

  // Pulse effect:
  // - While audio is playing: active pulse
  // - When awaiting audio (!activeUrl): gentle breathing pulse
  useEffect(() => {
    const shouldPulse = isPlaying || !activeUrl;
    if (!shouldPulse) {
      pulseAnim.setValue(1);
      return;
    }

    const targetScale = isPlaying ? 1.15 : 1.08;
    const duration = isPlaying ? 600 : 1000;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: targetScale,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPlaying, activeUrl, pulseAnim]);

  const handleTogglePlay = useCallback(async () => {
    if (!activeUrl) return;
    try {
      if (!soundRef.current) {
        await loadAndPlaySound(activeUrl);
        return;
      }

      if (isPlaying) {
        shouldAutoPlayRef.current = false;
        await soundRef.current.pauseAsync();
      } else {
        if (positionMillis >= durationMillis && durationMillis > 0) {
          await soundRef.current.replayAsync();
        } else {
          await soundRef.current.playAsync();
        }
      }
    } catch (err) {
      console.warn('[EmergencyAudioPlayer] Playback toggle error:', err);
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  }, [activeUrl, isPlaying, positionMillis, durationMillis, loadAndPlaySound]);

  const handlePrevChunk = useCallback(() => {
    if (isPlaying) {
      shouldAutoPlayRef.current = true;
    }
    setChunkIndex((i) => Math.max(0, i - 1));
  }, [isPlaying]);

  const handleNextChunk = useCallback(() => {
    if (isPlaying) {
      shouldAutoPlayRef.current = true;
    }
    setChunkIndex((i) => Math.min(totalChunks - 1, i + 1));
  }, [isPlaying, totalChunks]);

  const progressPercent = useMemo(() => {
    if (!durationMillis) return 0;
    return Math.min(100, Math.max(0, (positionMillis / durationMillis) * 100));
  }, [positionMillis, durationMillis]);

  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── Render: Awaiting Audio State ───────────────────────────────────────────
  if (!activeUrl) {
    return (
      <View
        style={styles.container}
        accessibilityRole="summary"
        accessibilityLabel="Emergency Audio Feed: Awaiting audio stream"
      >
        <View style={styles.headerRow}>
          <View style={styles.badgeRow}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <MaterialCommunityIcons name="microphone" size={17} color="#EA580C" />
            </Animated.View>
            <Text style={styles.badgeTitle} numberOfLines={1}>EMERGENCY AUDIO FEED</Text>
          </View>
          <View style={styles.waitingPill}>
            <View style={styles.pulsingDot} />
            <Text style={styles.waitingPillText} numberOfLines={1}>RECORDING IN PROGRESS</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          Ambient audio is captured in rolling 15-second slices to assist your response.
          The audio player will activate automatically once the first slice finishes uploading.
        </Text>

        {onRefresh && (
          <View style={styles.awaitingControlsRow}>
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isRefreshing}
              style={styles.checkButton}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Check for new emergency audio updates"
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#EA580C" />
              ) : (
                <MaterialCommunityIcons name="refresh" size={16} color="#EA580C" />
              )}
              <Text style={styles.checkButtonText}>
                {isRefreshing ? 'Checking for updates…' : 'Check for Audio Updates'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Render: Active Audio Player State ──────────────────────────────────────
  const humanIndex = chunkIndex + 1; // 1-based for display
  const chunkLabel = totalChunks > 1
    ? `Clip ${humanIndex} of ${totalChunks}`
    : 'Clip 1 of 1';

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel="Emergency Audio Player"
    >
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <MaterialCommunityIcons name="waveform" size={16} color="#DC2626" />
          <Text style={styles.badgeTitle}>EMERGENCY AUDIO CONTEXT</Text>
        </View>
        <Text style={styles.timeText}>
          {formatTime(positionMillis)} / {formatTime(durationMillis)}
        </Text>
      </View>

      <Text style={styles.subtitle}>
        Listen to ambient surroundings recorded during this emergency to assess the situation.
      </Text>

      {/* When only 1 clip exists and timestamp is known, show capture time cleanly */}
      {totalChunks === 1 && chunkTimestamp && (
        <View style={styles.singleTimestampRow}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={colors.text.secondary} />
          <Text style={styles.singleTimestampText}>Captured around {chunkTimestamp}</Text>
        </View>
      )}

      {/* Progress Track */}
      <View style={styles.progressBackground}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Action Playback Row */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={handleTogglePlay}
          style={styles.playButton}
          activeOpacity={0.8}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause emergency audio' : 'Play emergency audio'}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <MaterialCommunityIcons
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color="#FFFFFF"
              />
            </Animated.View>
          )}
          <Text style={styles.playButtonText}>
            {isPlaying ? 'Pause Audio' : positionMillis > 0 ? 'Resume Audio' : 'Play Ambient Audio'}
          </Text>
        </TouchableOpacity>

        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            style={styles.secondaryRefreshBtn}
            accessibilityRole="button"
            accessibilityLabel="Refresh audio chunk"
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.text.secondary} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={18} color={colors.text.secondary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Chunk Navigator — only shown when there are multiple clips */}
      {totalChunks > 1 && (
        <View style={styles.chunkNavRow}>
          <TouchableOpacity
            onPress={handlePrevChunk}
            disabled={chunkIndex === 0}
            style={[styles.chunkNavBtn, chunkIndex === 0 && styles.chunkNavBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Previous audio clip"
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={18}
              color={chunkIndex === 0 ? (isDark ? '#555' : '#CCC') : '#EA580C'}
            />
          </TouchableOpacity>

          <View style={styles.chunkInfoCol}>
            <Text style={styles.chunkLabel}>{chunkLabel}</Text>
            {chunkTimestamp && (
              <Text style={styles.chunkTimestamp}>Captured {chunkTimestamp}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleNextChunk}
            disabled={chunkIndex === totalChunks - 1}
            style={[styles.chunkNavBtn, chunkIndex === totalChunks - 1 && styles.chunkNavBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Next audio clip"
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={chunkIndex === totalChunks - 1 ? (isDark ? '#555' : '#CCC') : '#EA580C'}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

EmergencyAudioPlayer.displayName = 'EmergencyAudioPlayer';

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? '#1C1917' : '#FFF7ED',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(234, 88, 12, 0.4)' : '#FDBA74',
      padding: 14,
      marginTop: 4,
      marginBottom: 8,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      minWidth: 0,
    },
    badgeTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: '#EA580C',
      letterSpacing: 0.5,
      flexShrink: 1,
    },
    waitingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : 'rgba(234, 88, 12, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      flexShrink: 0,
      marginLeft: 8,
    },
    pulsingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#EA580C',
    },
    waitingPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#EA580C',
      letterSpacing: 0.3,
    },
    timeText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#D1D5DB' : '#6B7280',
      fontVariant: ['tabular-nums'],
    },
    subtitle: {
      fontSize: 12,
      lineHeight: 17,
      color: isDark ? '#9CA3AF' : '#4B5563',
    },
    singleTimestampRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: -2,
    },
    singleTimestampText: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
      fontWeight: '500',
    },
    progressBackground: {
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      overflow: 'hidden',
      marginVertical: 4,
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#EA580C',
      borderRadius: 2,
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    awaitingControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      marginTop: 4,
    },
    playButton: {
      backgroundColor: '#EA580C',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      flex: 1,
      marginRight: 8,
    },
    playButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    checkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(234, 88, 12, 0.4)' : '#FDBA74',
      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.12)' : '#FFFFFF',
    },
    checkButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#EA580C',
    },
    secondaryRefreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // ── Chunk navigator
    chunkNavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    },
    chunkNavBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(234, 88, 12, 0.4)' : '#FDBA74',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.1)' : '#FFFFFF',
    },
    chunkNavBtnDisabled: {
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
      backgroundColor: 'transparent',
    },
    chunkInfoCol: {
      alignItems: 'center',
      minWidth: 110,
    },
    chunkLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#D1D5DB' : '#6B7280',
      textAlign: 'center',
    },
    chunkTimestamp: {
      fontSize: 10,
      fontWeight: '500',
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginTop: 2,
      textAlign: 'center',
    },
  });
