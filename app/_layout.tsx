import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Image } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';
import { SessionContext } from '../src/context/SessionContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { TopToast } from '../src/components/TopToast';
import { toastRef } from '../src/utils/toast';
import { CustomAlertModal } from '../src/components/CustomAlertModal';
import { customAlertRef } from '../src/utils/customAlert';
import { useAppUpdates } from '../src/hooks/useAppUpdates';
import { AppUpdateModal } from '../src/components/AppUpdateModal';
import { HapticsProvider } from '../src/context/HapticsContext';
import { AlertProvider } from '../src/context/AlertContext';
import '../src/services/backgroundLocation';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // NOTE: usePushNotifications is intentionally NOT called here.
  // Calling it at the root would trigger Notifications.requestPermissionsAsync()
  // before the user has been through the /permissions onboarding screen,
  // creating a confusing OS dialog at the wrong moment (e.g. after reinstall
  // on Samsung devices that restore AsyncStorage via Auto Backup).
  // It is called inside RootNavigator, which only renders after loading clears.

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
      <HapticsProvider>
        <SessionContext.Provider value={session}>
          <AlertProvider>
            <RootNavigator loading={loading} session={session} />
          </AlertProvider>
        </SessionContext.Provider>
      </HapticsProvider>
    </ThemeProvider>
  );
}

import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';

// We extract this into its own component so it sits *inside* the ThemeProvider
// and can safely call useTheme() to dynamically control the StatusBar and Loading colors.
function RootNavigator({ loading, session }: { loading: boolean; session: Session | null }) {
  const { isDark, colors } = useTheme();
  const { isUpdateReady, applyUpdate, dismissUpdate } = useAppUpdates();

  // Register for push notifications here — safely deferred until after the
  // loading gate so the OS permission dialog never fires before onboarding.
  usePushNotifications(session?.user?.id);

  if (loading) {
    // Seamless splash transition: render the app logo without any spinner
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 140, height: 140, resizeMode: 'contain' }}
        />
      </View>
    );
  }

  const navTheme = {
    ...(isDark ? NavDarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? NavDarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
    },
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavThemeProvider value={navTheme}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="permissions" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="history" options={{ headerShown: false }} />
            <Stack.Screen name="feed/index" options={{ headerShown: false }} />
            <Stack.Screen name="medical-profile" />
            <Stack.Screen name="safety-guidelines" />
            <Stack.Screen name="community-alert/[alertId]" options={{ headerShown: false }} />
          </Stack>
        </View>
      </NavThemeProvider>
      <TopToast ref={toastRef} />
      <CustomAlertModal ref={customAlertRef} />
      
      {/* Global In-App OTA Update Prompt */}
      <AppUpdateModal 
        visible={isUpdateReady} 
        onApply={applyUpdate} 
        onDismiss={dismissUpdate} 
      />
    </>
  );
}
