import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

interface HapticsContextType {
  hapticsEnabled: boolean;
  toggleHaptics: (enabled: boolean) => Promise<void>;
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => void;
}

const HapticsContext = createContext<HapticsContextType | undefined>(undefined);

const HAPTICS_STORAGE_KEY = '@safen_haptics_enabled';

export const HapticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);

  // Load preference on mount
  useEffect(() => {
    const loadHapticsPreference = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(HAPTICS_STORAGE_KEY);
        if (storedValue !== null) {
          setHapticsEnabled(storedValue === 'true');
        }
      } catch (error) {
        console.warn('Failed to load haptics preference:', error);
      }
    };
    loadHapticsPreference();
  }, []);

  const toggleHaptics = useCallback(async (enabled: boolean) => {
    setHapticsEnabled(enabled);
    try {
      await AsyncStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
      // Provide immediate feedback if they are enabling it
      if (enabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.warn('Failed to save haptics preference:', error);
    }
  }, []);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(style);
    }
  }, [hapticsEnabled]);

  const value = useMemo(() => ({
    hapticsEnabled,
    toggleHaptics,
    triggerHaptic
  }), [hapticsEnabled, toggleHaptics, triggerHaptic]);

  return (
    <HapticsContext.Provider value={value}>
      {children}
    </HapticsContext.Provider>
  );
};

export const useHaptics = () => {
  const context = useContext(HapticsContext);
  if (context === undefined) {
    throw new Error('useHaptics must be used within a HapticsProvider');
  }
  return context;
};
