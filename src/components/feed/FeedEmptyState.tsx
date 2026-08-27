import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export const FeedEmptyState = ({ nationalOnly }: { nationalOnly: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="shield-check-outline" size={32} color={colors.text.secondary} />
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Nothing reported right now
      </Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>
        {nationalOnly
          ? 'Turn on location to see incidents reported near you.'
          : 'Security updates for your area will appear here as they come in.'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  title    : { fontSize: 15, fontWeight: '700' },
  body     : { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
