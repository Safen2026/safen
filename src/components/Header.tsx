import React, { useContext } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar as RNStatusBar, TouchableOpacity, Image, Modal, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SessionContext } from '../context/SessionContext';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmationModal } from './ConfirmationModal';

export const Header = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  
  const session = useContext(SessionContext);
  const [localAvatarUri, setLocalAvatarUri] = React.useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [notificationsVisible, setNotificationsVisible] = React.useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = React.useState(true);
  const [permissionError, setPermissionError] = React.useState<{visible: boolean, msg: string}>({ visible: false, msg: '' });
  
  // Try to get the first name from Supabase user_metadata, fallback to 'User'
  const fullName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.first_name || '';
  const firstName = fullName ? fullName.split(' ')[0] : 'User';

  const handleAvatarPress = () => {
    setPickerVisible(true);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setPermissionError({ visible: true, msg: 'Sorry, we need camera permissions to make this work!' });
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setLocalAvatarUri(result.assets[0].uri);
      // TODO: Partner - Wire up Supabase Storage upload here
      // uploadAvatarToSupabase(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPermissionError({ visible: true, msg: 'Sorry, we need camera roll permissions to make this work!' });
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setLocalAvatarUri(result.assets[0].uri);
      // TODO: Partner - Wire up Supabase Storage upload here
      // uploadAvatarToSupabase(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handleAvatarPress}>
          {localAvatarUri ? (
            <Image source={{ uri: localAvatarUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color={colors.white} />
          )}
        </TouchableOpacity>
        <View style={styles.greetingContainer}>
          <Text style={styles.greetingText}>Hello, {firstName}</Text>
          <Text style={styles.subtitleText}>Stay safe today</Text>
        </View>
      </View>
      
      <View style={styles.rightContent}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} onPress={toggleTheme}>
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.text.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.iconButton} 
          activeOpacity={0.7} 
          onPress={() => {
            setNotificationsVisible(true);
            setHasUnreadNotifications(false);
          }}
        >
          {hasUnreadNotifications && <View style={styles.badge} />}
          <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <Modal visible={pickerVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom + 20, 40) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Update Profile Picture</Text>
            
            <TouchableOpacity style={styles.sheetOption} onPress={() => { setPickerVisible(false); setTimeout(takePhoto, 400); }}>
              <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="camera" size={22} color={colors.primary} />
              </View>
              <Text style={styles.sheetOptionText}>Take a Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.sheetOption} onPress={() => { setPickerVisible(false); setTimeout(pickImage, 400); }}>
              <View style={[styles.sheetIconBox, { backgroundColor: colors.icon.activeTab + '15' }]}>
                <Ionicons name="images" size={22} color={colors.icon.activeTab} />
              </View>
              <Text style={styles.sheetOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={notificationsVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setNotificationsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNotificationsVisible(false)}>
          <Pressable style={styles.notificationsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.notificationItem}>
              <View style={[styles.notificationIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              </View>
              <View style={styles.notificationContent}>
                <Text style={styles.notificationTextTitle}>Emergency Contacts Updated</Text>
                <Text style={styles.notificationTextBody}>Your emergency contacts have been successfully synced.</Text>
                <Text style={styles.notificationTime}>2 hours ago</Text>
              </View>
            </View>

            <View style={styles.notificationItem}>
              <View style={[styles.notificationIcon, { backgroundColor: colors.status.safeText + '15' }]}>
                <Ionicons name="bulb-outline" size={20} color={colors.status.safeText} />
              </View>
              <View style={styles.notificationContent}>
                <Text style={styles.notificationTextTitle}>Safety Tip of the Day</Text>
                <Text style={styles.notificationTextBody}>Did you know you can trigger an SOS by swiping the home button?</Text>
                <Text style={styles.notificationTime}>Yesterday</Text>
              </View>
            </View>
            
            <View style={[styles.notificationItem, { borderBottomWidth: 0 }]}>
              <View style={[styles.notificationIcon, { backgroundColor: '#3B82F6' + '15' }]}>
                <Ionicons name="sync-circle-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.notificationContent}>
                <Text style={styles.notificationTextTitle}>App Updated</Text>
                <Text style={styles.notificationTextBody}>Safen has been updated to version 2.1 with new dark mode features.</Text>
                <Text style={styles.notificationTime}>3 days ago</Text>
              </View>
            </View>

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
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 10 : 40 : 50,
    paddingBottom: 15,
    backgroundColor: colors.background,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#00875A', 
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  greetingContainer: {
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  subtitleText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E02B2B', 
    zIndex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.text.primary,
  },
  sheetCancel: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  notificationsModal: {
    width: '90%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  notificationsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  notificationItem: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTextTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  notificationTextBody: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.border, 
    // Need a slightly darker color than border for text, let's use secondary with opacity or just secondary
    opacity: 0.7,
  },
});
