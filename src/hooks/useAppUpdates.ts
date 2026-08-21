import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import { supabase } from '../lib/supabase';

// Throttle checks to once every 15 minutes max
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function useAppUpdates() {
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const lastCheckRef = useRef<number>(0);

  const checkForUpdates = useCallback(async () => {
    // Only check in production builds (not in Expo Go or dev clients unless explicitly configured)
    if (__DEV__) return;
    
    try {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) {
        return; // Throttled
      }
      
      lastCheckRef.current = now;

      // 1. Check if update is available
      const updateCheck = await Updates.checkForUpdateAsync();
      
      if (updateCheck.isAvailable) {
        // 2. Fetch the update in the background
        const result = await Updates.fetchUpdateAsync();
        
        if (result.isNew) {
          // 3. Before prompting, verify user is NOT in an active emergency
          const { data: { session } } = await supabase.auth.getSession();
          const user = session?.user;
          
          if (user) {
            const { data, error } = await supabase
              .from('alerts')
              .select('id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .limit(1)
              .maybeSingle();

            if (error) {
              console.warn('Error checking active alerts:', error);
            }

            // If they are in an active SOS, silently abort the prompt
            if (data && !error) {
              return;
            }
          }

          // Safe to prompt
          setIsUpdateReady(true);
        }
      }
    } catch (error) {
      // Silently catch errors (e.g. offline, timeout) so we don't crash or annoy the user
      console.warn('Background update check failed:', error);
    }
  }, []);

  // Check on initial mount
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Check when app comes back to the foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkForUpdates();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkForUpdates]);

  const applyUpdate = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.warn('Failed to reload app:', e);
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsUpdateReady(false);
  }, []);

  return {
    isUpdateReady,
    applyUpdate,
    dismissUpdate
  };
}
