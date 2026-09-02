import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/context/ThemeContext';
import { useHaptics } from '../src/context/HapticsContext';
import { Shadows, ThemeColors } from '../src/constants/Theme';
import { PermissionCard, PermissionItemConfig } from '../src/components/permissions/PermissionCard';

export const PERMISSIONS_STORAGE_KEY = '@safen_permissions_completed';

interface PermissionState {
  location: boolean;
  microphone: boolean;
  camera: boolean;
  notifications: boolean;
}

// Static configuration moved outside the component to prevent recreation on every render
const PERMISSION_ITEMS: PermissionItemConfig[] = [
  {
    key: 'location',
    title: 'Live Location',
    description: 'Shares your real-time GPS coordinates with your safety network during an SOS.',
    iconName: 'navigate',
    badge: 'Critical',
    badgeColor: '#E02B2B',
  },
  {
    key: 'microphone',
    title: 'Microphone',
    description: 'Silently records emergency audio evidence when SOS is activated.',
    iconName: 'mic',
    badge: 'SOS Evidence',
    badgeColor: '#EA580C',
  },
  {
    key: 'camera',
    title: 'Camera',
    description: 'Captures visual evidence and attaches incident photos during emergencies.',
    iconName: 'camera',
    badge: 'SOS Evidence',
    badgeColor: '#2563EB',
  },
  {
    key: 'notifications',
    title: 'Safety Alerts',
    description: 'Instantly alerts you when someone in your network triggers an SOS.',
    iconName: 'notifications',
    badge: 'Network',
    badgeColor: '#107C41',
  },
];

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { hapticsEnabled } = useHaptics();
  const [loading, setLoading] = useState(false);
  const [requestingKey, setRequestingKey] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<PermissionState>({
    location: false,
    microphone: false,
    camera: false,
    notifications: false,
  });

  // Check current permission statuses on mount
  const checkCurrentPermissions = useCallback(async () => {
    try {
      const [loc, mic, cam, notif] = await Promise.allSettled([
        Location.getForegroundPermissionsAsync(),
        Audio.getPermissionsAsync(),
        ImagePicker.getCameraPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]);

      setPermissions({
        location: loc.status === 'fulfilled' && loc.value.granted,
        microphone: mic.status === 'fulfilled' && mic.value.granted,
        camera: cam.status === 'fulfilled' && cam.value.granted,
        notifications: notif.status === 'fulfilled' && notif.value.granted,
      });
    } catch (e) {
      console.warn('Error checking permissions:', e);
    }
  }, []);

  useEffect(() => {
    checkCurrentPermissions();
  }, [checkCurrentPermissions]);

  // Optimized individual permission request handler
  const requestSinglePermission = useCallback(async (key: string) => {
    if (requestingKey) return; // Prevent concurrent requests
    
    setRequestingKey(key);
    try {
      let granted = false;
      if (key === 'location') {
        const res = await Location.requestForegroundPermissionsAsync();
        granted = res.granted;
      } else if (key === 'microphone') {
        const res = await Audio.requestPermissionsAsync();
        granted = res.granted;
      } else if (key === 'camera') {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        granted = res.granted;
      } else if (key === 'notifications') {
        const res = await Notifications.requestPermissionsAsync();
        granted = res.granted;
      }

      if (granted) {
        try {
          if (hapticsEnabled) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {} // Ignore haptic errors on unsupported devices
      } else {
        // Log rejection for security auditing or prompt user to open OS settings
        console.warn(`User rejected ${key} permission.`);
      }

      setPermissions(prev => ({ ...prev, [key]: granted }));
    } catch (e) {
      console.warn(`Error requesting ${key} permission:`, e);
      Alert.alert('Permission Error', `We encountered a problem requesting the ${key} permission. Please try again or check your OS settings.`);
    } finally {
      setRequestingKey(null);
    }
  }, [requestingKey, hapticsEnabled]);

  // Request all pending permissions sequentially (strict error handling)
  const handleEnableAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Location
      if (!permissions.location) {
        try {
          const res = await Location.requestForegroundPermissionsAsync();
          setPermissions(prev => ({ ...prev, location: res.granted }));
        } catch (e) {
          console.warn('Failed to request location:', e);
        }
      }

      // 2. Microphone
      if (!permissions.microphone) {
        try {
          const res = await Audio.requestPermissionsAsync();
          setPermissions(prev => ({ ...prev, microphone: res.granted }));
        } catch (e) {
          console.warn('Failed to request microphone:', e);
        }
      }

      // 3. Camera
      if (!permissions.camera) {
        try {
          const res = await ImagePicker.requestCameraPermissionsAsync();
          setPermissions(prev => ({ ...prev, camera: res.granted }));
        } catch (e) {
          console.warn('Failed to request camera:', e);
        }
      }

      // 4. Notifications
      if (!permissions.notifications) {
        try {
          const res = await Notifications.requestPermissionsAsync();
          setPermissions(prev => ({ ...prev, notifications: res.granted }));
        } catch (e) {
          console.warn('Failed to request notifications:', e);
        }
      }

      try {
        if (hapticsEnabled) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {} // Haptics not available on all devices — safe to ignore

      // Mark completed & proceed
      await completeAndProceed();
    } catch (e) {
      console.warn('Critical error in handleEnableAll:', e);
      // Even if a critical error occurs during batch processing, we let them proceed to avoid soft-locking onboarding
      await completeAndProceed();
    } finally {
      setLoading(false);
    }
  }, [permissions, hapticsEnabled]);

  const completeAndProceed = async () => {
    try {
      await AsyncStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');
    } catch (e) {
      console.error('Failed to write permission status to storage:', e);
    }
    router.replace('/(tabs)');
  };

  const allGranted =
    permissions.location &&
    permissions.microphone &&
    permissions.camera &&
    permissions.notifications;

  // Memoize styles to avoid recreation
  const currentStyles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={currentStyles.container}>
      <ScrollView
        contentContainerStyle={[
          currentStyles.scrollContent,
          {
            paddingTop: Math.max(insets.top + 16, 32),
            paddingBottom: Math.max(insets.bottom + 24, 36),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={currentStyles.heroSection}>
          <View style={currentStyles.heroIconCircle}>
            <MaterialCommunityIcons name="shield-lock-outline" size={38} color={colors.primary} />
          </View>
          <Text style={currentStyles.heroTitle} accessibilityRole="header">
            Emergency Readiness
          </Text>
          <Text style={currentStyles.heroSubtitle}>
            To protect you instantly during an emergency without delay, Safen requires the following device permissions.
          </Text>
        </View>

        {/* Permission Cards List */}
        <View style={currentStyles.list}>
          {PERMISSION_ITEMS.map(item => (
            <PermissionCard
              key={item.key}
              item={item}
              granted={permissions[item.key as keyof PermissionState]}
              isRequesting={requestingKey === item.key}
              colors={colors}
              onRequest={requestSinglePermission}
              disabled={loading || (requestingKey !== null && requestingKey !== item.key)}
            />
          ))}
        </View>

        {/* CTA Buttons */}
        <View style={currentStyles.ctaSection}>
          <TouchableOpacity
            style={[currentStyles.primaryCta, loading && currentStyles.ctaDisabled]}
            onPress={allGranted ? completeAndProceed : handleEnableAll}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={allGranted ? 'Continue to Safen application' : 'Enable all permissions and continue'}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={currentStyles.primaryCtaText}>
                {allGranted ? 'Continue to Safen' : 'Enable All & Continue'}
              </Text>
            )}
          </TouchableOpacity>

          {!allGranted && (
            <TouchableOpacity
              style={currentStyles.skipButton}
              onPress={completeAndProceed}
              disabled={loading}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Skip remaining permissions for now"
            >
              <Text style={currentStyles.skipText}>
                I'll set up remaining permissions later
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: isDark ? '#ffffff10' : '#0A246312',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
    color: colors.text.primary,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
    color: colors.text.secondary,
  },
  list: {
    gap: 12,
    marginBottom: 28,
  },
  ctaSection: {
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  primaryCta: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  primaryCtaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  skipButton: {
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
});
