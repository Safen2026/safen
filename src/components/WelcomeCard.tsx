import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  Modal, Pressable, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
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

  const fullName = getUserDisplayName(session?.user);
  const firstName = fullName === 'A Safen user' ? 'User' : fullName.split(' ')[0];

  const openPicker = useCallback(() => setPickerVisible(true), []);
  const closePicker = useCallback(() => setPickerVisible(false), []);

  const handlePickAndUpload = useCallback(async (source: 'camera' | 'gallery') => {
    setPickerVisible(false);
    await new Promise(r => setTimeout(r, 400)); // Let sheet close first

    try {
      let result;
      if (source === 'camera') {
        const available = await ImagePicker.getCameraPermissionsAsync();
        if (available.canAskAgain === false && available.status !== 'granted') {
          showToast({
            title: 'Permission Needed',
            subtitle: 'Camera access was denied. Please enable it in your device Settings.',
            icon: 'warning',
          });
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToast({
            title: 'Permission Needed',
            subtitle: 'Camera permission is required. Please allow it in Settings and try again.',
            icon: 'warning',
          });
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToast({
            title: 'Permission Needed',
            subtitle: 'Gallery permission is required. Please allow it in Settings and try again.',
            icon: 'warning',
          });
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        const success = await uploadAvatar(result.assets[0].uri);
        if (success) {
          showToast({
            title: 'Photo Updated',
            subtitle: 'Your profile picture has been saved successfully.',
            icon: 'checkmark-circle',
          });
        } else {
          showToast({
            title: 'Upload Failed',
            subtitle: 'Check your internet connection and try again.',
            icon: 'warning',
          });
        }
      }
    } catch (err) {
      console.error('handlePickAndUpload error:', err);
      showToast({
        title: 'Error',
        subtitle: 'Something went wrong. Please try again.',
        icon: 'warning',
      });
    }
  }, [uploadAvatar]);

  // Stable callers so JSX never holds a new function reference per render
  const handleCamera = useCallback(() => handlePickAndUpload('camera'), [handlePickAndUpload]);
  const handleGallery = useCallback(() => handlePickAndUpload('gallery'), [handlePickAndUpload]);

  return (
    <View style={styles.container}>
      {/* Interactive Avatar */}
      <TouchableOpacity
        style={styles.avatarWrap}
        activeOpacity={0.8}
        onPress={openPicker}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Update profile picture"
        accessibilityHint="Double tap to open photo options"
      >
        <Avatar 
          name={fullName} 
          avatarUrl={avatarUrl} 
          isLoading={uploading} 
          size={56} 
        />

        {/* Small Camera badge */}
        {!uploading && (
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            <Ionicons name="camera" size={9} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Text Greeting */}
      <View style={styles.textBlock} accessible={true} accessibilityRole="header">
        <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
          {firstName}
        </Text>
      </View>

      {/* Avatar picker bottom sheet */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closePicker}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={closePicker}
          accessibilityRole="button"
          accessibilityLabel="Close photo menu"
        >
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: colors.white, paddingBottom: Math.max(insets.bottom + 20, 36) }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Update Profile Picture</Text>

            {!(Platform.OS === 'ios' && __DEV__) ? (
              <TouchableOpacity 
                style={[styles.sheetOption, { borderBottomColor: colors.border }]} 
                onPress={handleCamera}
                accessibilityRole="button"
              >
                <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Take a Photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity 
              style={[styles.sheetOption, { borderBottomColor: colors.border }]} 
              onPress={handleGallery}
              accessibilityRole="button"
            >
              <View style={[styles.sheetIconBox, { backgroundColor: (colors.icon?.activeTab || colors.primary) + '15' }]}>
                <Ionicons name="images" size={22} color={colors.icon?.activeTab || colors.primary} />
              </View>
              <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.sheetCancel, { backgroundColor: colors.border }]} 
              onPress={closePicker}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetCancelText, { color: colors.text.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 16,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
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
  textBlock: {
    flex: 1,
  },
  greeting: {
    fontSize: 13,
    marginBottom: 2,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  sheetOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sheetCancel: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
