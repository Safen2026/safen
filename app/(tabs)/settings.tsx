import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, Switch, ScrollView, Image, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { SessionContext } from '../../src/context/SessionContext';
import { FeedbackModal } from '../../src/components/FeedbackModal';
import { useAvatar } from '../../src/hooks/useAvatar';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const session = useContext(SessionContext);
  const { avatarUrl } = useAvatar();
  
  const [signingOut, setSigningOut] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);

  // Mock states for demo purposes
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushModalVisible, setPushModalVisible] = useState(false);

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

  const updatePushInSupabase = async (val: boolean) => {
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
  };

  const handleTogglePush = async (val: boolean) => {
    triggerHaptic();
    if (!val) {
      // Trying to disable, show modal
      setPushModalVisible(true);
    } else {
      // Enabling, do it immediately
      setPushEnabled(true);
      await updatePushInSupabase(true);
    }
  };

  const confirmDisablePush = async () => {
    setPushModalVisible(false);
    triggerHaptic();
    setPushEnabled(false);
    await updatePushInSupabase(false);
  };

  const [hapticsEnabled, setHapticsEnabled] = useState(true);


  const fullName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.first_name || 'User';

  const triggerHaptic = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleSignOut = () => {
    triggerHaptic();
    setSignOutModalVisible(true);
  };

  const confirmSignOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setSignOutModalVisible(false);
    router.replace('/auth');
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Error", "Could not open the link.");
    }
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: 'Check out SAFEN - The ultimate personal safety platform! Stay safe and connected. https://safen.app',
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  const renderRow = (icon: any, title: string, rightContent: React.ReactNode, onPress?: () => void, isDestructive = false) => (
    <TouchableOpacity 
      style={styles.row} 
      onPress={() => {
        if (onPress) {
          triggerHaptic();
          onPress();
        }
      }} 
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.iconBox, isDestructive && { backgroundColor: '#EF444415' }]}>
        <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : colors.text.secondary} />
      </View>
      <Text style={[styles.rowText, isDestructive && { color: '#EF4444' }]}>{title}</Text>
      <View style={styles.rightContentBox}>
        {rightContent}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
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

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            {renderRow(
              isDark ? "moon-outline" : "sunny-outline",
              "Dark Mode",
              <Switch 
                value={isDark} 
                onValueChange={(val) => { triggerHaptic(); toggleTheme(); }} 
                trackColor={{ true: '#00875A' }} 
              />
            )}
            <View style={styles.divider} />
            {renderRow(
              "notifications-outline",
              "Push Notifications",
              <Switch 
                value={pushEnabled} 
                onValueChange={handleTogglePush} 
                trackColor={{ true: '#00875A' }} 
              />
            )}

            <View style={styles.divider} />
            {renderRow(
              "hardware-chip-outline",
              "Haptic Feedback",
              <Switch 
                value={hapticsEnabled} 
                onValueChange={(val) => { 
                  if (val) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setHapticsEnabled(val); 
                }} 
                trackColor={{ true: '#00875A' }} 
              />
            )}
          </View>
        </View>



        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT & ABOUT</Text>
          <View style={styles.card}>
            {renderRow(
              "share-social-outline",
              "Share SAFEN",
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />,
              handleShareApp
            )}
            <View style={styles.divider} />
            {renderRow(
              "chatbubbles-outline",
              "Share Feedback",
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />,
              () => setFeedbackModalVisible(true)
            )}
            <View style={styles.divider} />
            {renderRow(
              "document-text-outline",
              "Privacy Policy",
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />,
              () => openLink('https://safen.app/privacy')
            )}
            <View style={styles.divider} />
            {renderRow(
              "shield-checkmark-outline",
              "Terms of Service",
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />,
              () => openLink('https://safen.app/terms')
            )}
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SESSION</Text>
          <View style={styles.card}>
            {renderRow(
              "log-out-outline",
              "Sign Out",
              signingOut ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="chevron-forward" size={16} color="#EF4444" />,
              handleSignOut,
              true
            )}
          </View>
        </View>

        <Text style={styles.versionText}>SAFEN v1.0.0</Text>
      </ScrollView>

      {/* Sign Out Modal */}
      <Modal
        visible={signOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSignOutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="log-out-outline" size={48} color="#EF4444" />
              <Text style={styles.modalTitle}>Sign Out</Text>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>
              <Text style={styles.modalWarning}>
                You will need to sign in again to trigger alerts and share your location during an emergency.
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { triggerHaptic(); setSignOutModalVisible(false); }} disabled={signingOut}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmButton, signingOut && { opacity: 0.7 }]} onPress={() => { triggerHaptic(); confirmSignOut(); }} disabled={signingOut}>
                  {signingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Sign Out</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Disable Push Modal */}
      <Modal
        visible={pushModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPushModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="notifications-off-outline" size={48} color="#EF4444" />
              <Text style={styles.modalTitle}>Disable Alerts?</Text>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>Are you sure you want to turn off Push Notifications?</Text>
              <Text style={styles.modalWarning}>
                If disabled, you will not be notified when your emergency contacts trigger an SOS or share reports with you!
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { triggerHaptic(); setPushModalVisible(false); }}>
                  <Text style={styles.cancelText}>Keep On</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={confirmDisablePush}>
                  <Text style={styles.confirmText}>Turn Off</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <FeedbackModal visible={feedbackModalVisible} onClose={() => setFeedbackModalVisible(false)} />
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
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  rowText: { fontSize: 16, color: colors.text.primary, fontWeight: '500', flex: 1 },
  rightContentBox: { flexDirection: 'row', alignItems: 'center' },
  valueText: { fontSize: 15, color: colors.text.secondary, fontWeight: '400' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 60 },
  versionText: { textAlign: 'center', color: colors.text.secondary, fontSize: 13, fontWeight: '500', marginTop: 10, marginBottom: 20, letterSpacing: 0.5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  modalHeader: { padding: 24, paddingBottom: 0, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: colors.text.primary, fontSize: 22, fontWeight: 'bold', marginTop: 12, letterSpacing: 0.5 },
  modalBody: { padding: 24 },
  modalMessage: { fontSize: 18, color: colors.text.primary, textAlign: 'center', fontWeight: '700', marginBottom: 8 },
  modalWarning: { fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  cancelText: { color: colors.text.secondary, fontWeight: '700', fontSize: 16 },
  confirmButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
  confirmText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
});