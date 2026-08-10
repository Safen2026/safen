import React, { useContext, useState } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  Modal, Pressable, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';
import { SessionContext } from '../context/SessionContext';
import { useAvatar } from '../hooks/useAvatar';
import { ConfirmationModal } from './ConfirmationModal';

export const WelcomeCard = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const session = useContext(SessionContext);
  const { avatarUrl, uploading, uploadAvatar } = useAvatar();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [permissionError, setPermissionError] = useState<{ visible: boolean; msg: string }>({
    visible: false,
    msg: '',
  });
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const fullName = session?.user?.user_metadata?.full_name
    ?? session?.user?.email?.split('@')[0]
    ?? 'there';
  const firstName = fullName.split(' ')[0];

  const handlePickAndUpload = async (source: 'camera' | 'gallery') => {
    setPickerVisible(false);
    await new Promise(r => setTimeout(r, 400)); // Let sheet close first

    try {
      let result;
      if (source === 'camera') {
        const available = await ImagePicker.getCameraPermissionsAsync();
        if (available.canAskAgain === false && available.status !== 'granted') {
          setPermissionError({
            visible: true,
            msg: 'Camera access was denied. Please enable it in your device Settings.',
          });
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setPermissionError({
            visible: true,
            msg: 'Camera permission is required. Please allow it in Settings and try again.',
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
          setPermissionError({
            visible: true,
            msg: 'Gallery permission is required. Please allow it in Settings and try again.',
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
          setUploadSuccess(true);
        } else {
          setPermissionError({
            visible: true,
            msg: 'Upload failed. Check your internet connection and try again.',
          });
        }
      }
    } catch (err) {
      console.error('handlePickAndUpload error:', err);
      setPermissionError({
        visible: true,
        msg: 'Something went wrong. Please try again.',
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Interactive Avatar */}
      <TouchableOpacity
        style={styles.avatarWrap}
        activeOpacity={0.8}
        onPress={() => setPickerVisible(true)}
        disabled={uploading}
        accessibilityLabel="Update profile picture"
      >
        {uploading ? (
          <View style={[styles.avatarFallback, { backgroundColor: colors.white }]}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.white }]}>
            <Ionicons name="person" size={26} color={colors.text.secondary} />
          </View>
        )}

        {/* Small Camera badge */}
        {!uploading && (
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            <Ionicons name="camera" size={9} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Text Greeting */}
      <View style={styles.textBlock}>
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
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable
            style={[styles.bottomSheet, { backgroundColor: colors.white, paddingBottom: Math.max(insets.bottom + 20, 36) }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Update Profile Picture</Text>

            {Platform.OS !== 'ios' || !__DEV__ ? (
              <TouchableOpacity style={[styles.sheetOption, { borderBottomColor: colors.border }]} onPress={() => handlePickAndUpload('camera')}>
                <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Take a Photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={[styles.sheetOption, { borderBottomColor: colors.border }]} onPress={() => handlePickAndUpload('gallery')}>
              <View style={[styles.sheetIconBox, { backgroundColor: (colors.icon?.activeTab || colors.primary) + '15' }]}>
                <Ionicons name="images" size={22} color={colors.icon?.activeTab || colors.primary} />
              </View>
              <Text style={[styles.sheetOptionText, { color: colors.text.primary }]}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetCancel, { backgroundColor: colors.border }]} onPress={() => setPickerVisible(false)}>
              <Text style={[styles.sheetCancelText, { color: colors.text.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feedback Modals */}
      <ConfirmationModal
        visible={permissionError.visible}
        title="Permission Needed"
        message={permissionError.msg}
        iconName="warning"
        iconColor={colors.primary}
        onClose={() => setPermissionError({ visible: false, msg: '' })}
      />
      <ConfirmationModal
        visible={uploadSuccess}
        title="Photo Updated"
        message="Your profile picture has been saved successfully."
        iconName="checkmark-circle"
        iconColor="#00875A"
        onClose={() => setUploadSuccess(false)}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
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
