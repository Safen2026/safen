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
  
  // Initialize with system color scheme
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  // Keep track of whether the user has explicitly overridden the theme
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

  // Sync with OS theme changes ONLY if the user hasn't explicitly overridden it
  useEffect(() => {
    if (userOverride === null) {
      setIsDark(systemColorScheme === 'dark');
    }
  }, [systemColorScheme, userOverride]);

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
