import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/context/ThemeContext';
import { Shadows } from '../src/constants/Theme';

export const PERMISSIONS_STORAGE_KEY = '@safen_permissions_completed';

interface PermissionState {
  location: boolean;
  microphone: boolean;
  camera: boolean;
  notifications: boolean;
}

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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

  // Request individual permission
  const requestSinglePermission = async (key: keyof PermissionState) => {
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
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }

      setPermissions(prev => ({ ...prev, [key]: granted }));
    } catch (e) {
      console.warn(`Error requesting ${key} permission:`, e);
    } finally {
      setRequestingKey(null);
    }
  };

  // Request all pending permissions sequentially
  const handleEnableAll = async () => {
    setLoading(true);
    try {
      // 1. Location
      if (!permissions.location) {
        try {
          const res = await Location.requestForegroundPermissionsAsync();
          setPermissions(prev => ({ ...prev, location: res.granted }));
        } catch {}
      }

      // 2. Microphone
      if (!permissions.microphone) {
        try {
          const res = await Audio.requestPermissionsAsync();
          setPermissions(prev => ({ ...prev, microphone: res.granted }));
        } catch {}
      }

      // 3. Camera
      if (!permissions.camera) {
        try {
          const res = await ImagePicker.requestCameraPermissionsAsync();
          setPermissions(prev => ({ ...prev, camera: res.granted }));
        } catch {}
      }

      // 4. Notifications
      if (!permissions.notifications) {
        try {
          const res = await Notifications.requestPermissionsAsync();
          setPermissions(prev => ({ ...prev, notifications: res.granted }));
        } catch {}
      }

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      // Mark completed & proceed
      await completeAndProceed();
    } catch (e) {
      console.warn('Error in handleEnableAll:', e);
      await completeAndProceed();
    } finally {
      setLoading(false);
    }
  };

  const completeAndProceed = async () => {
    try {
      await AsyncStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');
    } catch {}
    router.replace('/(tabs)');
  };

  const allGranted =
    permissions.location &&
    permissions.microphone &&
    permissions.camera &&
    permissions.notifications;

  const PERMISSION_ITEMS = [
    {
      key: 'location' as const,
      title: 'Live Location',
      description: 'Shares your real-time GPS coordinates with your safety network during an SOS.',
      icon: (color: string) => <Ionicons name="navigate" size={22} color={color} />,
      granted: permissions.location,
      badge: 'Critical',
      badgeColor: '#E02B2B',
    },
    {
      key: 'microphone' as const,
      title: 'Microphone',
      description: 'Silently records emergency audio evidence when SOS is activated.',
      icon: (color: string) => <Ionicons name="mic" size={22} color={color} />,
      granted: permissions.microphone,
      badge: 'SOS Evidence',
      badgeColor: '#EA580C',
    },
    {
      key: 'camera' as const,
      title: 'Camera',
      description: 'Captures visual evidence and attaches incident photos during emergencies.',
      icon: (color: string) => <Ionicons name="camera" size={22} color={color} />,
      granted: permissions.camera,
      badge: 'SOS Evidence',
      badgeColor: '#2563EB',
    },
    {
      key: 'notifications' as const,
      title: 'Safety Alerts',
      description: 'Instantly alerts you when someone in your network triggers an SOS.',
      icon: (color: string) => <Ionicons name="notifications" size={22} color={color} />,
      granted: permissions.notifications,
      badge: 'Network',
      badgeColor: '#107C41',
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top + 16, 32),
            paddingBottom: Math.max(insets.bottom + 24, 36),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <View style={[styles.heroIconCircle, { backgroundColor: '#0A246312' }]}>
            <MaterialCommunityIcons name="shield-lock-outline" size={38} color="#0A2463" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
            Emergency Readiness
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
            To protect you instantly during an emergency without delay, Safen requires the following device permissions.
          </Text>
        </View>

        {/* Permission Cards */}
        <View style={styles.list}>
          {PERMISSION_ITEMS.map(item => {
            const isRequesting = requestingKey === item.key;
            return (
              <View
                key={item.key}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.white,
                    borderColor: item.granted ? '#107C4140' : colors.border,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: item.badgeColor + '18' }]}>
                    {item.icon(item.badgeColor)}
                  </View>

                  <View style={styles.cardInfo}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                        {item.title}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: item.badgeColor + '15' }]}>
                        <Text style={[styles.badgeText, { color: item.badgeColor }]}>
                          {item.badge}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
                      {item.description}
                    </Text>
                  </View>
                </View>

                {/* Status or Action Button */}
                <View style={styles.cardFooter}>
                  {item.granted ? (
                    <View style={styles.grantedBadge}>
                      <Ionicons name="checkmark-circle" size={18} color="#107C41" />
                      <Text style={styles.grantedText}>Enabled</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.grantButton, { borderColor: colors.border }]}
                      onPress={() => requestSinglePermission(item.key)}
                      disabled={isRequesting || loading}
                      activeOpacity={0.7}
                    >
                      {isRequesting ? (
                        <ActivityIndicator size="small" color="#0A2463" />
                      ) : (
                        <Text style={styles.grantButtonText}>Allow Access</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={[styles.primaryCta, loading && styles.ctaDisabled]}
            onPress={allGranted ? completeAndProceed : handleEnableAll}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryCtaText}>
                {allGranted ? 'Continue to Safen' : 'Enable All & Continue'}
              </Text>
            )}
          </TouchableOpacity>

          {!allGranted && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={completeAndProceed}
              disabled={loading}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.skipText, { color: colors.text.secondary }]}>
                I'll set up remaining permissions later
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  list: {
    gap: 12,
    marginBottom: 28,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  cardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB60',
  },
  grantedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  grantedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#107C41',
  },
  grantButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
  },
  grantButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A2463',
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
    backgroundColor: '#0A2463',
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
  },
});
