import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
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

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            const { error } = await supabase.auth.signOut();
            setSigningOut(false);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            router.replace('/auth');
          },
        },
      ]
    );
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
});