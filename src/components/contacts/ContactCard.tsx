import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Contact } from '../ContactDetailsModal';
import { getInitials, getAvatarColor } from '../../utils/contactUtils';
import type { ThemeColors } from '../../constants/Theme';

interface ContactCardProps {
  item: Contact;
  colors: ThemeColors;
  deletingId: string | null;
  onPress: (contact: Contact) => void;
  onDeleteRequest: (contact: Contact) => void;
}

export const ContactCard = React.memo(function ContactCard({
  item,
  colors,
  deletingId,
  onPress,
  onDeleteRequest
}: ContactCardProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const isDeclined = item.status === 'declined';
  const isPending = item.status === 'pending';
  const isAcceptedOrNull = item.status === 'accepted' || !item.status;
  const isBeingDeleted = deletingId === item.id;

  if (!isAcceptedOrNull) {
    return (
      <View style={[styles.contactCard, { opacity: isDeclined ? 0.75 : 0.6 }]}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.contactInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.contactName}>{item.name}</Text>
          </View>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          {isDeclined ? (
            <View style={styles.statusRow}>
              <Ionicons name="close-circle" size={13} color={colors.status.alertText} />
              <Text style={[styles.statusText, { color: colors.status.alertText }]}>Request Declined</Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={13} color={colors.status.warningText} />
              <Text style={[styles.statusText, { color: colors.status.warningText }]}>Pending...</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => onDeleteRequest(item)}
          disabled={isBeingDeleted}
          accessibilityRole="button"
          accessibilityLabel={`Delete request for ${item.name}`}
        >
          {isBeingDeleted
            ? <ActivityIndicator size="small" color={colors.status.alertText} />
            : <Ionicons name="trash-outline" size={18} color={colors.status.alertText} />
          }
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.contactCard}
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${item.name}, ${item.phone}. ${item.relationship || ''}. Status: ${item.is_on_app ? 'Verified on Safen' : 'Not on app'}`}
    >
      <View style={{ marginRight: 12, position: 'relative' }}>
        <View style={[styles.avatar, { marginRight: 0 }, !item.avatar_url && { backgroundColor: getAvatarColor(item.name) }]}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
          )}
        </View>
        {/* Online indicator dot */}
        <View style={[
          styles.onlineDot,
          { backgroundColor: item.is_on_app ? colors.status.safeText : '#9CA3AF' }
        ]} />
      </View>

      <View style={styles.contactInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.contactName}>{item.name}</Text>
        </View>
        <Text style={styles.contactPhone}>{item.phone}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {item.relationship && (
            <View style={styles.relationshipBadge}>
              <Text style={styles.relationshipText}>{item.relationship}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>View Details</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: colors.white,
  },
  contactInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  contactName: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  contactPhone: { fontSize: 14, color: colors.text.secondary, marginBottom: 4 },
  relationshipBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  relationshipText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  deleteBtn: { borderColor: colors.status.alertBackground, backgroundColor: colors.status.alertBackground + '40' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  statusText: { fontSize: 12 },
});
