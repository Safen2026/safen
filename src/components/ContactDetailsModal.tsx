import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { sendPing } from '../lib/notifications';

export type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  is_on_app: boolean;
  contact_user_id: string | null;
  status?: string;
  avatar_url?: string;
  is_protector?: boolean;
};

interface ContactDetailsModalProps {
  visible: boolean;
  contact: Contact | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ContactDetailsModal = ({ visible, contact, onClose, onEdit, onDelete }: ContactDetailsModalProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);

  if (!contact) return null;

  const handleCall = () => {
    Linking.openURL(`tel:${contact.phone}`);
  };

  const handleSMS = () => {
    Linking.openURL(`sms:${contact.phone}`);
  };

  const handlePing = async () => {
    if (!contact.contact_user_id) {
      Alert.alert('Cannot Ping', 'This contact is not verified on Safen.');
      return;
    }
    const success = await sendPing(contact.contact_user_id);
    if (success) {
      Alert.alert('Ping Sent', `A check-in ping was successfully sent to ${contact.name}.`);
    } else {
      Alert.alert('Error', 'Failed to send ping. Please try again later.');
    }
  };

  const handleShareTrip = () => {
    Alert.alert('Share Live Trip', `Live location sharing with ${contact.name} has been initiated for the next 30 minutes.`);
    // Future integration for live location tracking
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modalContent} activeOpacity={1}>
          
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.avatar}
              activeOpacity={contact.avatar_url ? 0.8 : 1}
              onPress={() => {
                if (contact.avatar_url) setImageViewerVisible(true);
              }}
            >
              {contact.avatar_url ? (
                <Image source={{ uri: contact.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color={colors.white} />
              )}
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.name}>{contact.name}</Text>
              <Text style={styles.phone}>{contact.phone}</Text>
              {contact.relationship && <Text style={styles.relationship}>{contact.relationship}</Text>}
            </View>
          </View>

          <View style={styles.statusRow}>
            {contact.is_on_app ? (
              <View style={[styles.badge, { backgroundColor: colors.status.safeBackground }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.status.safeText} />
                <Text style={[styles.badgeText, { color: colors.status.safeText }]}>Verified on Safen</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: colors.border }]}>
                <Ionicons name="time" size={16} color={colors.text.secondary} />
                <Text style={[styles.badgeText, { color: colors.text.secondary }]}>Pending Invite</Text>
              </View>
            )}
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickBtn} onPress={handleCall}>
              <View style={[styles.quickIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="call" size={24} color={colors.primary} />
              </View>
              <Text style={styles.quickLabel}>Call</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.quickBtn} onPress={handleSMS}>
              <View style={[styles.quickIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="chatbubble" size={24} color={colors.primary} />
              </View>
              <Text style={styles.quickLabel}>Message</Text>
            </TouchableOpacity>

            {contact.is_on_app && contact.is_protector && (
              <TouchableOpacity style={styles.quickBtn} onPress={handlePing}>
                <View style={[styles.quickIcon, { backgroundColor: '#F59E0B15' }]}>
                  <Ionicons name="notifications" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.quickLabel}>Ping</Text>
              </TouchableOpacity>
            )}
          </View>

          {contact.is_on_app && (
            <TouchableOpacity style={styles.premiumAction} onPress={handleShareTrip}>
              <View style={styles.premiumIconBox}>
                <Ionicons name="navigate" size={24} color={colors.primary} />
              </View>
              <View style={styles.premiumText}>
                <Text style={styles.premiumTitle}>Share Live Trip</Text>
                <Text style={styles.premiumSub}>Share your location temporarily</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}

          {!contact.is_protector && (
            <View style={styles.manageSection}>
              <TouchableOpacity style={styles.manageBtn} onPress={() => { onClose(); onEdit(); }}>
                <Ionicons name="pencil" size={20} color={colors.text.secondary} />
                <Text style={styles.manageText}>Edit Contact Details</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.manageBtn, { borderBottomWidth: 0 }]} onPress={() => { onClose(); onDelete(); }}>
                <Ionicons name="trash" size={20} color="#DC2626" />
                <Text style={[styles.manageText, { color: '#DC2626' }]}>Remove Contact</Text>
              </TouchableOpacity>
            </View>
          )}

        </TouchableOpacity>
      </TouchableOpacity>

      {/* Fullscreen Image Viewer Modal */}
      <Modal visible={imageViewerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setImageViewerVisible(false)}>
        <TouchableOpacity style={styles.imageViewerOverlay} activeOpacity={1} onPress={() => setImageViewerVisible(false)}>
          <TouchableOpacity style={styles.imageViewerCloseBtn} onPress={() => setImageViewerVisible(false)}>
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          {contact.avatar_url && (
            <Image source={{ uri: contact.avatar_url }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  headerText: { alignItems: 'center' },
  name: { fontSize: 24, fontWeight: 'bold', color: colors.text.primary, marginBottom: 4, textAlign: 'center' },
  phone: { fontSize: 16, color: colors.text.secondary, marginBottom: 6, textAlign: 'center' },
  relationship: { fontSize: 14, color: colors.primary, fontWeight: '600', backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  closeBtn: { position: 'absolute', top: 0, right: 0, padding: 4, zIndex: 10 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 6 },
  badgeText: { fontSize: 14, fontWeight: '600' },
  quickActions: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 32, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 24 },
  quickBtn: { alignItems: 'center', gap: 8 },
  quickIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 14, fontWeight: '500', color: colors.text.primary },
  premiumAction: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 16, borderRadius: 16, marginBottom: 24 },
  premiumIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  premiumText: { flex: 1 },
  premiumTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text.primary, marginBottom: 2 },
  premiumSub: { fontSize: 13, color: colors.text.secondary },
  manageSection: { backgroundColor: colors.background, borderRadius: 16, overflow: 'hidden' },
  manageBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  manageText: { fontSize: 16, fontWeight: '600', color: colors.text.primary, marginLeft: 16 },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: { width: '100%', height: '80%' },
  imageViewerCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
});
