import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { showToast } from '../utils/toast';

interface AvatarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: (uri: string) => Promise<boolean>;
}

export const AvatarPickerModal = memo(function AvatarPickerModal({
  visible,
  onClose,
  onUpload,
}: AvatarPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const handlePickAndUpload = useCallback(async (source: 'camera' | 'gallery') => {
    onClose();
    await new Promise((r) => setTimeout(r, 400));

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
        showToast({ title: 'Uploading', subtitle: 'Saving profile picture...', icon: 'cloud-upload-outline' });
        const success = await onUpload(result.assets[0].uri);
        showToast(
          success
            ? { title: 'Photo Updated', subtitle: 'Profile picture saved.', icon: 'checkmark-circle' }
            : { title: 'Upload Failed', subtitle: 'Check your connection.', icon: 'warning' }
        );
      }
    } catch {
      showToast({ title: 'Error', subtitle: 'Something went wrong.', icon: 'warning' });
    }
  }, [onClose, onUpload]);

  const handleCamera = useCallback(() => handlePickAndUpload('camera'), [handlePickAndUpload]);
  const handleGallery = useCallback(() => handlePickAndUpload('gallery'), [handlePickAndUpload]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close photo menu"
      >
        <Pressable
          style={[
            styles.bottomSheet,
            { backgroundColor: colors.white, paddingBottom: Math.max(insets.bottom + 20, 36) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Update Profile Picture</Text>

          {!(Platform.OS === 'ios' && __DEV__) && (
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
          )}

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
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.sheetCancelText, { color: colors.text.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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

