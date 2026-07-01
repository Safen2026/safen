import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { LightTheme, DarkTheme } from '../constants/Theme';

// Define the shape of our context
type ThemeContextType = {
  isDark: boolean;
  colors: typeof LightTheme;
  toggleTheme: () => void;
};

// Create the context with a default value
export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: LightTheme,
  toggleTheme: () => {},
});

// Custom hook to use the theme
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Get system color scheme as initial state
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');

  // Update theme when system theme changes, if desired.
  // We'll keep it manual toggleable for now, but initialize to system pref.
  useEffect(() => {
    setIsDark(systemColorScheme === 'dark');
  }, [systemColorScheme]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const colors = isDark ? DarkTheme : LightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
