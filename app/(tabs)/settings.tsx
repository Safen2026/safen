import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { SessionContext } from '../../src/context/SessionContext';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const session = useContext(SessionContext);
  const [signingOut, setSigningOut] = useState(false);

  const [signOutModalVisible, setSignOutModalVisible] = useState(false);

  const handleSignOut = () => {
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

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.header}>Settings</Text>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="person-circle-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.rowText}>{session?.user?.phone ?? 'Unknown'}</Text>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SESSION</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handleSignOut} disabled={signingOut}>
            {signingOut ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            )}
            <Text style={[styles.rowText, { color: '#EF4444' }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

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
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setSignOutModalVisible(false)}
                  disabled={signingOut}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, signingOut && { opacity: 0.7 }]}
                  onPress={confirmSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.confirmText}>Sign Out</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  header: { fontSize: 28, fontWeight: '800', color: colors.text.primary, marginBottom: 28 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, letterSpacing: 0.8, marginBottom: 8 },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  rowText: { fontSize: 15, color: colors.text.primary, fontWeight: '500' },
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
  confirmText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
});