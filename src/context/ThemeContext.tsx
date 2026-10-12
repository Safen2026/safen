import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightTheme, DarkTheme } from '../constants/Theme';

const THEME_STORAGE_KEY = '@safen_theme_override';

type ThemeContextType = {
  isDark: boolean;
  colors: typeof LightTheme;
  toggleTheme: () => void;
};

export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: LightTheme,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const isMounted = React.useRef(false);
  
  // Initialize with system color scheme
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  // Load saved user preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme !== null) {
          const isDarkOverride = savedTheme === 'dark';
          setUserOverride(isDarkOverride);
          setIsDark(isDarkOverride);
        }
      } catch (e) {
        console.warn('Failed to load theme preference:', e);
      }
    };
    loadTheme();
  }, []);

  // Sync with OS theme changes
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    // If the system color scheme changes AFTER mount, it means the user actively toggled their phone's settings.
    // In this case, we should prioritize the phone's setting and clear any manual override they previously set.
    setIsDark(systemColorScheme === 'dark');
    setUserOverride(null);
    AsyncStorage.removeItem(THEME_STORAGE_KEY).catch(() => {});
  }, [systemColorScheme]);

  const toggleTheme = async () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    setUserOverride(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
    } catch (e) {
      console.warn('Failed to save theme preference:', e);
    }
  };

  const colors = isDark ? DarkTheme : LightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
