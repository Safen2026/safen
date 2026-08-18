import { useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '../src/context/SessionContext';
import { useTheme } from '../src/context/ThemeContext';
import { PERMISSIONS_STORAGE_KEY } from './permissions';

export default function Root() {
  const { colors } = useTheme();
  const session = useSession();
  const [checking, setChecking] = useState(true);
  const [permissionsDone, setPermissionsDone] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const val = await AsyncStorage.getItem(PERMISSIONS_STORAGE_KEY);
        setPermissionsDone(val === 'true');
      } catch {
        setPermissionsDone(false);
      } finally {
        setChecking(false);
      }
    }

    if (session) {
      checkSetup();
    } else {
      setChecking(false);
    }
  }, [session]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // If not logged in, go to auth
  if (!session) return <Redirect href="/auth" />;

  // If logged in but hasn't completed emergency readiness, go to permissions
  if (!permissionsDone) return <Redirect href="/permissions" />;

  // Otherwise, go straight to the app
  return <Redirect href="/(tabs)" />;
}