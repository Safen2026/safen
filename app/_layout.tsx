import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';
import { SessionContext } from '../src/context/SessionContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { TopToast } from '../src/components/TopToast';
import { toastRef } from '../src/utils/toast';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  usePushNotifications(session?.user?.id);

  useEffect(() => {
    // Get current session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Also listen for future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider>
      <SessionContext.Provider value={session}>
        <RootNavigator loading={loading} />
      </SessionContext.Provider>
    </ThemeProvider>
  );
}

// We extract this into its own component so it sits *inside* the ThemeProvider
// and can safely call useTheme() to dynamically control the StatusBar and Loading colors.
function RootNavigator({ loading }: { loading: boolean }) {
  const { isDark, colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="permissions" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" />
        <Stack.Screen name="medical-profile" />
        <Stack.Screen name="safety-guidelines" />
      </Stack>
      <TopToast ref={toastRef} />
    </>
  );
}