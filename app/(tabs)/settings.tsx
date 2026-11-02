import * as Updates from 'expo-updates';
import { customAlert } from '../../src/utils/customAlert';
import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Switch, ScrollView, Image, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/Theme';
import { useHaptics } from '../../src/context/HapticsContext';
import { supabase } from '../../src/lib/supabase';
import { firebaseAuth } from '../../src/lib/firebase';
import { signOut } from '@react-native-firebase/auth';
import { useSession } from '../../src/context/SessionContext';
import { FeedbackModal } from '../../src/components/FeedbackModal';
import { useAvatar } from '../../src/hooks/useAvatar';
import { AvatarPickerModal } from '../../src/components/AvatarPickerModal';
import { SignOutModal } from '../../src/components/settings/SignOutModal';
import { DeleteAccountModal } from '../../src/components/settings/DeleteAccountModal';
import { DisablePushModal } from '../../src/components/settings/DisablePushModal';
import { SettingsRow } from '../../src/components/settings/SettingsRow';
import { useAlertContext } from '../../src/context/AlertContext';
import { BroadcastScopeModal } from '../../src/components/BroadcastScopeModal';
import { SCOPE_OPTIONS } from '../../src/utils/broadcastScope';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { avatarUrl, uploadAvatar } = useAvatar();
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const { broadcastScope, setBroadcastScope } = useAlertContext();
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  
  const [signingOut, setSigningOut] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushModalVisible, setPushModalVisible] = useState(false);
  const { hapticsEnabled, toggleHaptics, triggerHaptic } = useHaptics();
  const fullName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.first_name || 'User';

  // Fetch initial preference from Supabase
  useEffect(() => {
    async function fetchPreferences() {
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('push_enabled')
        .eq('id', session.user.id)
        .single();
        
      if (!error && data && data.push_enabled !== null) {
        setPushEnabled(data.push_enabled);
      }
    }
    fetchPreferences();
  }, [session?.user?.id]);

  const updatePushInSupabase = React.useCallback(async (val: boolean) => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({ push_enabled: val })
      .eq('id', session.user.id);

    if (error) {
      console.warn('Failed to update push preference:', error);
      setPushEnabled(!val); // Revert on failure
      customAlert('Error', 'Failed to save your preference. Please try again.');
    }
  }, [session?.user?.id]);

  const handleTogglePush = React.useCallback(async (val: boolean) => {
    triggerHaptic();
    if (!val) {
      setPushModalVisible(true);
    } else {
      setPushEnabled(true);
      await updatePushInSupabase(true);
    }
  }, [triggerHaptic, updatePushInSupabase]);

  const confirmDisablePush = React.useCallback(async () => {
    setPushModalVisible(false);
    triggerHaptic();
    setPushEnabled(false);
    await updatePushInSupabase(false);
  }, [triggerHaptic, updatePushInSupabase]);

  const handleSignOut = React.useCallback(() => {
    triggerHaptic();
    setSignOutModalVisible(true);
  }, [triggerHaptic]);

  const confirmSignOut = React.useCallback(async () => {
    setSigningOut(true);
    try {
      if (firebaseAuth) await signOut(firebaseAuth);
      await supabase.auth.signOut();
      setSigningOut(false);
      setSignOutModalVisible(false);
      router.replace('/auth');
    } catch (err: unknown) {
      setSigningOut(false);
      const msg = err instanceof Error ? err.message : String(err);
      customAlert('Error', msg);
    }
  }, []);

  const confirmDeleteAccount = React.useCallback(async () => {
    setDeleting(true);
    triggerHaptic();
    
    const { error } = await supabase.rpc('delete_user');
    
    if (error) {
      setDeleting(false);
      customAlert('Error', error.message || 'Could not delete your account.');
      return;
    }
    
    if (firebaseAuth) await signOut(firebaseAuth);
    setDeleting(false);
    setDeleteModalVisible(false);
    router.replace('/auth');
  }, [triggerHaptic]);

  const openLink = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      customAlert("Error", "Could not open the link.");
    }
  }, []);

  const handleShareApp = React.useCallback(async () => {
    try {
      await Share.share({
        message: 'Check out SAFEN - The ultimate personal safety platform! Stay safe and connected. https://safen.app',
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  }, []);

  const handleToggleTheme = React.useCallback((val: boolean) => {
    triggerHaptic(); 
    toggleTheme();
  }, [triggerHaptic, toggleTheme]);

  const handleToggleHaptics = React.useCallback((val: boolean) => {
    toggleHaptics(val);
  }, [toggleHaptics]);

  const handleOpenMedicalProfile = React.useCallback(() => {
    triggerHaptic();
    router.push('/medical-profile');
  }, [triggerHaptic]);


  const handleOpenFeedback = React.useCallback(() => {
    triggerHaptic();
    setFeedbackModalVisible(true);
  }, [triggerHaptic]);

  const handleOpenPrivacy = React.useCallback(() => {
    triggerHaptic();
    openLink('https://safen.app/privacy');
  }, [triggerHaptic, openLink]);

  const handleOpenTerms = React.useCallback(() => {
    triggerHaptic();
    openLink('https://safen.app/terms');
  }, [triggerHaptic, openLink]);

  const handleDeleteAccountRequest = React.useCallback(() => {
    triggerHaptic();
    setDeleteModalVisible(true);
  }, [triggerHaptic]);

  const handleOpenScopeModal = React.useCallback(() => {
    triggerHaptic();
    setScopeModalVisible(true);
  }, [triggerHaptic]);

  const handleOpenPermissions = React.useCallback(() => {
    triggerHaptic();
    router.push('/permissions');
  }, [triggerHaptic]);

  const handleCloseScopeModal = React.useCallback(() => setScopeModalVisible(false), []);
  const handleCloseDeleteModal = React.useCallback(() => setDeleteModalVisible(false), []);
  const handleCloseSignOutModal = React.useCallback(() => setSignOutModalVisible(false), []);
  const handleClosePushModal = React.useCallback(() => setPushModalVisible(false), []);
  const handleCloseFeedbackModal = React.useCallback(() => setFeedbackModalVisible(false), []);

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Settings</Text>

        {/* Hero Profile Header */}
        <View style={styles.heroSection}>
          <TouchableOpacity
            style={styles.avatarContainer}
            activeOpacity={0.8}
            onPress={() => setAvatarPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={48} color={colors.white} />
            )}
            <View style={styles.avatarCameraOverlay}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.heroName}>{fullName}</Text>
          <Text style={styles.heroPhone}>{session?.user?.phone ?? 'Unknown Number'}</Text>
        </View>

        {/* Emergency & Safety */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMERGENCY & SAFETY</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="medical-outline"
              title="Medical Profile"
              colors={colors}
              onPress={handleOpenMedicalProfile}
              rightContent={
                <View style={styles.iceInfoRow}>
                  <Text style={styles.iceInfoText}>ICE Info</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </View>
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="radio-outline"
              title="Default SOS Audience"
              subtitle={
                <View style={styles.scopeSubtitleRow}>
                  <Ionicons
                    name={SCOPE_OPTIONS[broadcastScope].icon}
                    size={12}
                    color={SCOPE_OPTIONS[broadcastScope].accentColor}
                  />
                  <Text style={[styles.scopeSubtitleText, { color: SCOPE_OPTIONS[broadcastScope].accentColor }]}>
                    {SCOPE_OPTIONS[broadcastScope].title}
                  </Text>
                </View>
              }
              colors={colors}
              onPress={handleOpenScopeModal}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Device Permissions"
              subtitle="Location, Camera, Microphone & Alerts"
              colors={colors}
              onPress={handleOpenPermissions}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={isDark ? "moon-outline" : "sunny-outline"}
              title="Dark Mode"
              colors={colors}
              rightContent={
                <Switch 
                  value={isDark} 
                  onValueChange={handleToggleTheme} 
                  trackColor={{ true: '#00875A' }} 
                />
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="notifications-outline"
              title="Push Notifications"
              colors={colors}
              rightContent={
                <Switch 
                  value={pushEnabled} 
                  onValueChange={handleTogglePush} 
                  trackColor={{ true: '#00875A' }} 
                />
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="hardware-chip-outline"
              title="Haptic Feedback"
              colors={colors}
              rightContent={
                <Switch 
                  value={hapticsEnabled} 
                  onValueChange={handleToggleHaptics} 
                  trackColor={{ true: '#00875A' }} 
                />
              }
            />
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT & ABOUT</Text>
          <View style={styles.card}>

            <SettingsRow
              icon="share-social-outline"
              title="Share SAFEN"
              colors={colors}
              onPress={handleShareApp}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="chatbubbles-outline"
              title="Share Feedback"
              colors={colors}
              onPress={handleOpenFeedback}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="document-text-outline"
              title="Privacy Policy"
              colors={colors}
              onPress={handleOpenPrivacy}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Terms of Service"
              colors={colors}
              onPress={handleOpenTerms}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
          </View>
        </View>

        {/* Session */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SESSION</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="log-out-outline"
              title="Sign Out"
              colors={colors}
              isDestructive={true}
              onPress={handleSignOut}
              rightContent={
                signingOut ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="chevron-forward" size={16} color="#EF4444" />
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="trash-outline"
              title="Delete Account"
              colors={colors}
              isDestructive={true}
              onPress={handleDeleteAccountRequest}
              rightContent={<Ionicons name="chevron-forward" size={16} color="#EF4444" />}
            />
          </View>
        </View>

        <Text style={styles.versionText}>SAFEN v1.0.0{Updates.updateId ? ' (' + Updates.updateId.slice(0, 7) + ')' : ''}</Text>
      </ScrollView>

      {/* Delete Account Modal */}
      <DeleteAccountModal 
        visible={deleteModalVisible}
        deleting={deleting}
        colors={colors}
        onCancel={handleCloseDeleteModal}
        onConfirm={confirmDeleteAccount}
      />

      {/* Sign Out Modal */}
      <SignOutModal 
        visible={signOutModalVisible}
        signingOut={signingOut}
        colors={colors}
        onCancel={handleCloseSignOutModal}
        onConfirm={confirmSignOut}
      />

      {/* Disable Push Modal */}
      <DisablePushModal 
        visible={pushModalVisible}
        colors={colors}
        onCancel={handleClosePushModal}
        onConfirm={confirmDisablePush}
      />

      <FeedbackModal visible={feedbackModalVisible} onClose={handleCloseFeedbackModal} />

      {/* Avatar Picker */}
      <AvatarPickerModal
        visible={avatarPickerVisible}
        onClose={() => setAvatarPickerVisible(false)}
        onUpload={uploadAvatar}
      />

      {/* Broadcast Scope Modal */}
      <BroadcastScopeModal
        visible={scopeModalVisible}
        currentScope={broadcastScope}
        onSelect={setBroadcastScope}
        onClose={handleCloseScopeModal}
        source="settings"
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 28, fontWeight: '800', color: colors.text.primary, marginBottom: 12, paddingHorizontal: 20 },
  heroSection: { alignItems: 'center', marginBottom: 32, paddingHorizontal: 20 },
  avatarContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#00875A', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 12, borderWidth: 4, borderColor: colors.border, position: 'relative' },
  avatarCameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  avatarImage: { width: '100%', height: '100%' },
  heroName: { fontSize: 22, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  heroPhone: { fontSize: 16, color: colors.text.secondary, fontWeight: '500' },
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  iceInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iceInfoText: { fontSize: 13, color: colors.text.secondary, fontWeight: '500' },
  scopeSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  scopeSubtitleText: { fontSize: 13, fontWeight: '500' },
  rowBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.white },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  rowText: { fontSize: 16, color: colors.text.primary, fontWeight: '500', flex: 1 },
  rightContentBox: { flexDirection: 'row', alignItems: 'center' },
  valueText: { fontSize: 15, color: colors.text.secondary, fontWeight: '400' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 60 },
  versionText: { textAlign: 'center', color: colors.text.secondary, fontSize: 13, fontWeight: '500', marginTop: 10, letterSpacing: 0.5 },
});