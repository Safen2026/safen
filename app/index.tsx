import { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '../src/context/SessionContext';
import { useTheme } from '../src/context/ThemeContext';
import { checkNeedsPermissionsOnboarding } from '../src/utils/permissionUtils';

export default function Root() {
  const { colors } = useTheme();
  const session = useSession();
  const [checking, setChecking] = useState(true);
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    if (!session) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    checkNeedsPermissionsOnboarding().then((needs) => {
      if (!cancelled) {
        setNeedsPermissions(needs);
        setChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, [session]);

  // While verifying session & permissions, show seamless logo screen without any spinner
  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 140, height: 140, resizeMode: 'contain' }}
        />
      </View>
    );
  }

  if (!session) return <Redirect href="/auth" />;
  if (needsPermissions) return <Redirect href="/permissions" />;
  return <Redirect href="/(tabs)" />;
}
