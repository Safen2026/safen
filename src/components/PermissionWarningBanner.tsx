import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
  Platform,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useTheme } from '../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type MissingPermission =
  | 'both_critical'
  | 'location'
  | 'notifications'
  | 'safety_and_evidence'
  | 'evidence_both'
  | 'camera'
  | 'microphone';

interface BannerConfig {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accentColor: string;
  bgColor: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBannerConfig(missing: MissingPermission, isDark: boolean): BannerConfig {
  switch (missing) {
    case 'both_critical':
      return {
        icon: 'warning',
        title: 'Safety Features Disabled',
        subtitle: 'Location & Notifications are off. Safen cannot protect you.',
        accentColor: '#DC2626',
        bgColor: isDark ? '#3B0A0A' : '#FEF2F2',
      };
    case 'location':
      return {
        icon: 'location-outline',
        title: 'Location Is Off',
        subtitle: 'Responders cannot find you in an emergency.',
        accentColor: '#D97706',
        bgColor: isDark ? '#2D1F00' : '#FFFBEB',
      };
    case 'notifications':
      return {
        icon: 'notifications-off-outline',
        title: 'Alerts Are Silenced',
        subtitle: "You won't receive SOS alerts from your safety network.",
        accentColor: '#2563EB',
        bgColor: isDark ? '#0D1B3E' : '#EFF6FF',
      };
    case 'safety_and_evidence':
      return {
        icon: 'alert-circle-outline',
        title: 'Permissions Incomplete',
        subtitle: 'Alerts and emergency evidence recording are limited.',
        accentColor: '#DC2626',
        bgColor: isDark ? '#3B0A0A' : '#FEF2F2',
      };
    case 'evidence_both':
      return {
        icon: 'videocam-off-outline',
        title: 'SOS Evidence Disabled',
        subtitle: 'Camera & Microphone are off. Video & audio cannot be recorded.',
        accentColor: '#EA580C',
        bgColor: isDark ? '#2D1200' : '#FFF7ED',
      };
    case 'camera':
      return {
        icon: 'camera-outline',
        title: 'Camera Access Off',
        subtitle: 'Incident photos & video evidence cannot be captured.',
        accentColor: '#2563EB',
        bgColor: isDark ? '#0A192F' : '#EFF6FF',
      };
    case 'microphone':
      return {
        icon: 'mic-off-outline',
        title: 'Microphone Access Off',
        subtitle: 'Emergency audio evidence cannot be captured during SOS.',
        accentColor: '#EA580C',
        bgColor: isDark ? '#2D1200' : '#FFF7ED',
      };
  }
}

// ─── Internal hook ────────────────────────────────────────────────────────────
// Polls OS permission state every 15 s, but ONLY while the app is in the
// foreground. When backgrounded the interval is paused to conserve resources.

function useCriticalPermissionStatus(): MissingPermission | null {
  const [missing, setMissing] = useState<MissingPermission | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const check = useCallback(async () => {
    try {
      const [locResult, notifResult, camResult, micResult] = await Promise.allSettled([
        Location.getForegroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
        ImagePicker.getCameraPermissionsAsync(),
        Audio.getPermissionsAsync(),
      ]);

      if (!mountedRef.current) return;

      const locGranted =
        locResult.status === 'fulfilled' && locResult.value.granted;
      const notifGranted =
        notifResult.status === 'fulfilled' && notifResult.value.granted;
      const camGranted =
        camResult.status === 'fulfilled' && camResult.value.granted;
      const micGranted =
        micResult.status === 'fulfilled' && micResult.value.granted;

      if (!locGranted && !notifGranted) {
        setMissing('both_critical');
      } else if (!locGranted) {
        setMissing('location');
      } else if (!notifGranted && (!camGranted || !micGranted)) {
        setMissing('safety_and_evidence');
      } else if (!notifGranted) {
        setMissing('notifications');
      } else if (!camGranted && !micGranted) {
        setMissing('evidence_both');
      } else if (!camGranted) {
        setMissing('camera');
      } else if (!micGranted) {
        setMissing('microphone');
      } else {
        setMissing(null);
      }
    } catch {
      // Silently fail — a banner check must never surface an error
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // already running
    check();
    intervalRef.current = setInterval(check, 15000);
  }, [check]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startPolling();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && prev !== 'active') {
        // App came to foreground — re-check immediately then resume polling
        startPolling();
      } else if (nextState !== 'active' && prev === 'active') {
        // App went to background — pause polling
        stopPolling();
      }
    });

    return () => {
      mountedRef.current = false;
      stopPolling();
      sub.remove();
    };
  }, [startPolling, stopPolling]);

  return missing;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PermissionWarningBanner = React.memo(function PermissionWarningBanner() {
  const { colors, isDark } = useTheme();
  const missing = useCriticalPermissionStatus();

  // Active missing state that determines what is rendered.
  // Kept non-null during slide-out animation so content remains visible while exiting,
  // then set to null when animation finishes so layout space collapses completely.
  const [displayedMissing, setDisplayedMissing] = useState<MissingPermission | null>(missing);

  // Slide + fade animation values, kept stable via useRef
  const slideAnim = useRef(new Animated.Value(missing ? 0 : -80)).current;
  const opacityAnim = useRef(new Animated.Value(missing ? 1 : 0)).current;

  const prevMissingRef = useRef<MissingPermission | null>(missing);

  useEffect(() => {
    const wasShowing = prevMissingRef.current !== null;
    const isShowing = missing !== null;
    prevMissingRef.current = missing;

    if (!wasShowing && isShowing) {
      // Appear: set displayed state, reset initial values, slide in
      setDisplayedMissing(missing);
      slideAnim.setValue(-80);
      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (wasShowing && !isShowing) {
      // Disappear: slide out, then unmount from layout
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setDisplayedMissing(null);
        }
      });
    } else if (isShowing && missing) {
      setDisplayedMissing(missing);
    }
  }, [missing, slideAnim, opacityAnim]);

  const router = useRouter();

  const handleFix = useCallback(() => {
    try {
      router.push('/permissions');
    } catch {
      if (Platform.OS === 'ios') {
        Linking.openURL('app-settings:').catch(() => {});
      } else {
        Linking.openSettings().catch(() => {});
      }
    }
  }, [router]);

  // When permissions are healthy and not animating out, unmount completely
  // so no empty whitespace or layout margins are left above the SOS button.
  if (!displayedMissing) return null;

  const activeConfig = getBannerConfig(displayedMissing, isDark);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      accessibilityLabel={`${activeConfig.title}. ${activeConfig.subtitle} Tap Fix to review permissions.`}
    >
      <TouchableOpacity
        style={[
          styles.banner,
          {
            backgroundColor: activeConfig.bgColor,
            borderColor: activeConfig.accentColor + (isDark ? '55' : '40'),
          },
        ]}
        onPress={handleFix}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${activeConfig.title}. ${activeConfig.subtitle}. Tap to review permissions.`}
      >
        {/* Left accent stripe */}
        <View style={[styles.stripe, { backgroundColor: activeConfig.accentColor }]} />

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: activeConfig.accentColor + '20' }]}>
          <Ionicons
            name={activeConfig.icon}
            size={20}
            color={activeConfig.accentColor}
          />
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text
            style={[styles.title, { color: isDark ? '#F5F5F5' : '#111827' }]}
            numberOfLines={1}
          >
            {activeConfig.title}
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? '#C4C4CC' : '#4B5563' }]}
            numberOfLines={2}
          >
            {activeConfig.subtitle}
          </Text>
        </View>

        {/* Fix CTA */}
        <TouchableOpacity
          style={[styles.fixBtn, { backgroundColor: activeConfig.accentColor }]}
          onPress={handleFix}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Review device permissions"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.fixBtnText}>Fix</Text>
          <Ionicons name="arrow-forward" size={12} color="#fff" style={styles.fixBtnIcon} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 14,
    // overflow hidden ensures the slide animation appears to emerge from
    // behind the card above, not float over it.
    overflow: 'hidden',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingRight: 12,
    gap: 10,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '400',
  },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    flexShrink: 0,
  },
  fixBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fixBtnIcon: {
    marginTop: 0.5,
  },
});
