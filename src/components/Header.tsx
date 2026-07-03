import React, { useContext } from 'react';
import {
  View, Text, StyleSheet, Platform, StatusBar as RNStatusBar,
  TouchableOpacity, Image, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SessionContext } from '../context/SessionContext';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmationModal } from './ConfirmationModal';
import { useAvatar } from '../hooks/useAvatar';
import { useNotifications, AppNotification } from '../hooks/useNotifications';

// Camera is unavailable on iOS simulator
const IS_SIMULATOR = Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV
  && (() => { try { return !window.navigator.product; } catch { return false; } })() === false;

const NOTIFICATION_TYPE_META: Record<AppNotification['type'], { icon: string; color: string }> = {
  sos: { icon: 'alert-circle', color: '#E02B2B' },
  medical: { icon: 'medkit', color: '#DC2626' },
  police: { icon: 'shield', color: '#2563EB' },
  fire: { icon: 'flame', color: '#EA580C' },
  report: { icon: 'document-text', color: '#7C3AED' },
  contact_added: { icon: 'person-add', color: '#00875A' },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export const Header = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const session = useContext(SessionContext);

  const { avatarUrl, uploading, uploadAvatar } = useAvatar();
  // Simulator has no camera — only show gallery option there
  const isSimulator = !Constants.isDevice;

  const { notifications, loading: notificationsLoading, unreadCount, markAllRead } = useNotifications();

  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [notificationsVisible, setNotificationsVisible] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<{ visible: boolean; msg: string }>({ visible: false, msg: '' });
  const [uploadSuccess, setUploadSuccess] = React.useState(false);

  const fullName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.first_name || '';
  const firstName = fullName ? fullName.split(' ')[0] : 'User';

  const handlePickAndUpload = async (source: 'camera' | 'gallery') => {
    setPickerVisible(false);
    await new Promise(r => setTimeout(r, 400)); // let sheet close first

    try {
      let result;
      if (source === 'camera') {
        // Check availability first — camera not available on simulators
        const available = await ImagePicker.getCameraPermissionsAsync();
        if (available.canAskAgain === false && available.status !== 'granted') {
          setPermissionError({ visible: true, msg: 'Camera access was denied. Please enable it in your device Settings.' });
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setPermissionError({ visible: true, msg: 'Camera permission is required. Please allow it in Settings and try again.' });
          return;
        }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          setPermissionError({ visible: true, msg: 'Gallery permission is required. Please allow it in Settings and try again.' });
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
        });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        const success = await uploadAvatar(result.assets[0].uri);
        if (success) setUploadSuccess(true);
        else setPermissionError({ visible: true, msg: 'Upload failed. Check your internet connection and try again.' });
      }
    } catch (err) {
      console.error('handlePickAndUpload error:', err);
      setPermissionError({ visible: true, msg: 'Something went wrong. Please try again.' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <TouchableOpacity style={styles.avatarContainer} onPress={() => setPickerVisible(true)} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.white} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color={colors.white} />
          )}
          {/* Camera badge */}
          {!uploading && (
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={10} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.greetingContainer}>
          <Text style={styles.greetingText}>Hello, {firstName}</Text>
          <Text style={styles.subtitleText}>Stay safe today</Text>
        </View>
      </View>

      <View style={styles.rightContent}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} onPress={toggleTheme}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={() => { setNotificationsVisible(true); markAllRead(); }}
        >
          {unreadCount > 0 && <View style={styles.badge} />}
          <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Avatar picker sheet */}
      <Modal visible={pickerVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom + 20, 40) }]} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Update Profile Picture</Text>
            {Platform.OS !== 'ios' || !__DEV__ ? (
              <TouchableOpacity style={styles.sheetOption} onPress={() => handlePickAndUpload('camera')}>
                <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                </View>
                <Text style={styles.sheetOptionText}>Take a Photo</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.sheetOption} onPress={() => handlePickAndUpload('gallery')}>
              <View style={[styles.sheetIconBox, { backgroundColor: colors.icon?.activeTab + '15' || '#15' }]}>
                <Ionicons name="images" size={22} color={colors.icon?.activeTab || colors.primary} />
              </View>
              <Text style={styles.sheetOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notifications modal */}
      <Modal visible={notificationsVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setNotificationsVisible(false)}>
        <Pressable style={[styles.modalOverlay, { justifyContent: 'center' }]} onPress={() => setNotificationsVisible(false)}>
          <Pressable style={styles.notificationsModal} onPress={e => e.stopPropagation()}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {notificationsLoading ? (
              <View style={styles.notificationsEmpty}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.notificationsEmpty}>
                <Ionicons name="notifications-off-outline" size={32} color={colors.text.secondary} />
                <Text style={styles.notificationsEmptyText}>You're all caught up</Text>
              </View>
            ) : (
              notifications.map((n, i, arr) => {
                const meta = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.report;
                return (
                  <View key={n.id} style={[styles.notificationItem, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.notificationIcon, { backgroundColor: meta.color + '15' }]}>
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationTextTitle}>{n.title}</Text>
                      <Text style={styles.notificationTextBody}>{n.body}</Text>
                      <Text style={styles.notificationTime}>{timeAgo(n.created_at)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

const getStyles = (colors: any) => StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 10 : 50, paddingBottom: 15, backgroundColor: colors.background },
  leftContent: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#00875A', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#00875A', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: colors.background },
  greetingContainer: { justifyContent: 'center' },
  greetingText: { fontSize: 20, fontWeight: 'bold', color: colors.text.primary },
  subtitleText: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  rightContent: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginLeft: 8, backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: 6, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E02B2B', zIndex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 20, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  sheetOptionText: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  sheetCancel: { marginTop: 20, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.border, alignItems: 'center' },
  sheetCancelText: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  notificationsModal: { width: '90%', backgroundColor: colors.white, borderRadius: 20, padding: 24, alignSelf: 'center' },
  notificationsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  notificationsTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  notificationsEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  notificationsEmptyText: { fontSize: 14, color: colors.text.secondary },
  notificationItem: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  notificationIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  notificationContent: { flex: 1 },
  notificationTextTitle: { fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 4 },
  notificationTextBody: { fontSize: 14, color: colors.text.secondary, lineHeight: 20, marginBottom: 6 },
  notificationTime: { fontSize: 12, color: colors.text.secondary, opacity: 0.7 },
});