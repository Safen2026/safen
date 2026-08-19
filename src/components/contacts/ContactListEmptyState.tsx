import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Theme';

interface ContactListEmptyStateProps {
  type: 'my_contacts' | 'protecting';
  colors: ThemeColors;
  maxContacts?: number;
  onAddContact?: () => void;
}

export const ContactListEmptyState = React.memo(function ContactListEmptyState({
  type,
  colors,
  maxContacts = 5,
  onAddContact
}: ContactListEmptyStateProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  if (type === 'protecting') {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="shield-account-outline" size={48} color={colors.text.secondary} />
        </View>
        <Text style={styles.emptyTitle} accessibilityRole="header">Nobody yet</Text>
        <Text style={styles.emptySubtitle}>
          When someone adds you as their emergency contact, they will appear here so you can check in on them.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="account-group-outline" size={48} color={colors.text.secondary} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">No emergency contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Add up to {maxContacts} people. Contacts on Safen will receive instant in-app alerts when you trigger SOS.
      </Text>
      {onAddContact && (
        <TouchableOpacity 
          style={styles.emptyAddBtn} 
          onPress={onAddContact}
          accessibilityRole="button"
          accessibilityLabel="Add Your First Contact"
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.emptyAddText}>Add Your First Contact</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  emptyAddText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
