import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, Switch, ScrollView, Image, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { firebaseAuth } from '../../src/lib/firebase';
import { signOut } from '@react-native-firebase/auth';
import { useSession } from '../../src/context/SessionContext';
import { FeedbackModal } from '../../src/components/FeedbackModal';
import { useAvatar } from '../../src/hooks/useAvatar';
import { SignOutModal } from '../../src/components/settings/SignOutModal';
import { DeleteAccountModal } from '../../src/components/settings/DeleteAccountModal';
import { DisablePushModal } from '../../src/components/settings/DisablePushModal';
import { SettingsRow } from '../../src/components/settings/SettingsRow';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { avatarUrl } = useAvatar();
  
  const [signingOut, setSigningOut] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushModalVisible, setPushModalVisible] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
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

  const triggerHaptic = React.useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticsEnabled]);

  const updatePushInSupabase = React.useCallback(async (val: boolean) => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({ push_enabled: val })
      .eq('id', session.user.id);

    if (error) {
      console.warn('Failed to update push preference:', error);
      setPushEnabled(!val); // Revert on failure
      Alert.alert('Error', 'Failed to save your preference. Please try again.');
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
  }, [hapticsEnabled]);

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
      Alert.alert('Error', msg);
    }
  }, []);

  const confirmDeleteAccount = React.useCallback(async () => {
    setDeleting(true);
    triggerHaptic();
    
    const { error } = await supabase.rpc('delete_user');
    
    if (error) {
      setDeleting(false);
      Alert.alert('Error', error.message || 'Could not delete your account.');
      return;
    }
    
    if (firebaseAuth) await signOut(firebaseAuth);
    setDeleting(false);
    setDeleteModalVisible(false);
    router.replace('/auth');
  }, [hapticsEnabled]);

  const openLink = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not open the link.");
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
    if (val) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHapticsEnabled(val);
  }, []);

  const handleOpenMedicalProfile = React.useCallback(() => {
    triggerHaptic();
    router.push('/medical-profile');
  }, [triggerHaptic]);

  const handleOpenSafetyGuidelines = React.useCallback(() => {
    triggerHaptic();
    router.push('/safety-guidelines');
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

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Settings</Text>

        {/* Hero Profile Header */}
        <View style={styles.heroSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={48} color={colors.white} />
            )}
          </View>
          <Text style={styles.heroName}>{fullName}</Text>
          <Text style={styles.heroPhone}>{session?.user?.phone ?? 'Unknown Number'}</Text>
        </View>

        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROFILE</Text>
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
              icon="book-outline"
              title="Safety Guidelines"
              colors={colors}
              onPress={handleOpenSafetyGuidelines}
              rightContent={<Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />}
            />
            <View style={styles.divider} />
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

        <Text style={styles.versionText}>SAFEN v1.0.0</Text>
      </ScrollView>

      {/* Delete Account Modal */}
      <DeleteAccountModal 
        visible={deleteModalVisible}
        deleting={deleting}
        colors={colors}
        onCancel={React.useCallback(() => setDeleteModalVisible(false), [])}
        onConfirm={confirmDeleteAccount}
      />

      {/* Sign Out Modal */}
      <SignOutModal 
        visible={signOutModalVisible}
        signingOut={signingOut}
        colors={colors}
        onCancel={React.useCallback(() => setSignOutModalVisible(false), [])}
        onConfirm={confirmSignOut}
      />

      {/* Disable Push Modal */}
      <DisablePushModal 
        visible={pushModalVisible}
        colors={colors}
        onCancel={React.useCallback(() => setPushModalVisible(false), [])}
        onConfirm={confirmDisablePush}
      />

      <FeedbackModal visible={feedbackModalVisible} onClose={React.useCallback(() => setFeedbackModalVisible(false), [])} />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 28, fontWeight: '800', color: colors.text.primary, marginBottom: 12, paddingHorizontal: 20 },
  heroSection: { alignItems: 'center', marginBottom: 32, paddingHorizontal: 20 },
  avatarContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#00875A', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 12, borderWidth: 4, borderColor: colors.border },
  avatarImage: { width: '100%', height: '100%' },
  heroName: { fontSize: 22, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  heroPhone: { fontSize: 16, color: colors.text.secondary, fontWeight: '500' },
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  iceInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iceInfoText: { fontSize: 13, color: colors.text.secondary, fontWeight: '500' },
  rowBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.white },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  rowText: { fontSize: 16, color: colors.text.primary, fontWeight: '500', flex: 1 },
  rightContentBox: { flexDirection: 'row', alignItems: 'center' },
  valueText: { fontSize: 15, color: colors.text.secondary, fontWeight: '400' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 60 },
  versionText: { textAlign: 'center', color: colors.text.secondary, fontSize: 13, fontWeight: '500', marginTop: 10, letterSpacing: 0.5 },
});