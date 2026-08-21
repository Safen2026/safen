import { Stack } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

export default function HistoryLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }} />
  );
}