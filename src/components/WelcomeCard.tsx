import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Pressable, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { useSession } from '../context/SessionContext';
import { useAvatar } from '../hooks/useAvatar';
import { Avatar } from './Avatar';
import { showToast } from '../utils/toast';
import { getUserDisplayName } from '../utils/userUtils';

export const WelcomeCard = React.memo(() => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const session = useSession();
  const { avatarUrl, uploading, uploadAvatar } = useAvatar();

  const [pickerVisible, setPickerVisible] = useState(false);

  const fullName  = getUserDisplayName(session?.user);
  const firstName = fullName === 'A Safen user' ? 'User' : fullName.split(' ')[0];

  const openPicker  = useCallback(() => setPickerVisible(true),  []);
  const closePicker = useCallback(() => setPickerVisible(false), []);

  const handlePickAndUpload = useCallback(async (source: 'camera' | 'gallery') => {
    setPickerVisible(false);
    await new Promise(r => setTimeout(r, 400));

    try {
      let result;
      if (source === 'camera') {
        const available = await ImagePicker.getCameraPermissionsAsync();
        if (available.canAskAgain === false && available.status !== 'granted') {
          showToast({ title: 'Permission Needed', subtitle: 'Camera access was denied. Enable it in Settings.', icon: 'warning' });
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToast({ title: 'Permission Needed', subtitle: 'Camera permission required.', icon: 'warning' });
          return;
        }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToast({ title: 'Permission Needed', subtitle: 'Gallery permission required.', icon: 'warning' });
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        const success = await uploadAvatar(result.assets[0].uri);
        showToast(success
          ? { title: 'Photo Updated', subtitle: 'Profile picture saved.', icon: 'checkmark-circle' }
          : { title: 'Upload Failed', subtitle: 'Check your connection.', icon: 'warning' }
        );
      }
    } catch (err) {
      showToast({ title: 'Error', subtitle: 'Something went wrong.', icon: 'warning' });
    }
  }, [uploadAvatar]);

  const handleCamera  = useCallback(() => handlePickAndUpload('camera'),  [handlePickAndUpload]);
  const handleGallery = useCallback(() => handlePickAndUpload('gallery'), [handlePickAndUpload]);

  return (
    <View style={styles.card}>
      {/* Avatar row */}
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.avatarWrap}
          activeOpacity={0.8}
          onPress={openPicker}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Update profile picture"
        >
          <Avatar name={fullName} avatarUrl={avatarUrl} isLoading={uploading} size={52} />
          {!uploading && (
            <View style={[styles.cameraBadge, { backgroundColor: '#E02B2B', borderColor: colors.white }]}>
              <Ionicons name="camera" size={9} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        {/* Greeting + chevron */}
        <TouchableOpacity
          style={styles.greetingRow}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/settings')}
          accessibilityRole="button"
          accessibilityLabel="Go to profile"
        >
          <View style={styles.greetingText}>
            <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
            <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{firstName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Member badge */}
      <View style={styles.badgeRow}>
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={10} color="#F59E0B" />
          <Text style={styles.premiumText}>Member</Text>
        </View>
      </View>

      {/* Avatar picker bottom sheet */}
      <Modal visible={pickerVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={closePicker}>
        <Pressable style={styles.modalOverlay} onPress={closePicker} accessibilityRole="button" accessibilityLabel="Close photo menu">
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: colors.white, paddingBottom: Math.max(insets.bottom + 20, 36) }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Update Profile Picture</Text>

            {!(Platform.OS === 'ios' && __DEV__) && (
              <TouchableOpacity style={[styles.sheetOption, { borderBottomColor: colors.border }]} onPress={handleCamera} accessibilityRole="button">
                <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Take a Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.sheetOption, { borderBottomColor: colors.border }]} onPress={handleGallery} accessibilityRole="button">
              <View style={[styles.sheetIconBox, { backgroundColor: (colors.icon?.activeTab || colors.primary) + '15' }]}>
                <Ionicons name="images" size={22} color={colors.icon?.activeTab || colors.primary} />
              </View>
              <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetCancel, { backgroundColor: colors.border }]} onPress={closePicker} accessibilityRole="button">
              <Text style={[styles.sheetCancelText, { color: colors.text.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

WelcomeCard.displayName = 'WelcomeCard';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  greetingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingText: {
    flex: 1,
  },
  greeting: {
    fontSize: 12,
    marginBottom: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F59E0B40',
  },
  premiumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  sheetIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  sheetOptionText: { fontSize: 16, fontWeight: '600' },
  sheetCancel: { marginTop: 20, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  sheetCancelText: { fontSize: 16, fontWeight: '700' },
});