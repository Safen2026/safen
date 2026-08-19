import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Contact } from '../ContactDetailsModal';
import type { ThemeColors } from '../../constants/Theme';

interface DeleteContactModalProps {
  visible: boolean;
  contact: Contact | null;
  colors: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteContactModal = React.memo(function DeleteContactModal({
  visible,
  contact,
  colors,
  onCancel,
  onConfirm
}: DeleteContactModalProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      statusBarTranslucent 
      onRequestClose={onCancel}
    >
      <View style={styles.deleteOverlay}>
        <View style={styles.deleteCard}>
          <View style={styles.deleteIconWrap}>
            <Ionicons name="trash-outline" size={32} color="#EF4444" />
          </View>
          <Text style={styles.deleteTitle} accessibilityRole="header">
            {contact?.status === 'pending' ? 'Delete Pending Request' : 'Remove Contact'}
          </Text>
          <Text style={styles.deleteMessage}>
            {contact?.status === 'pending' 
              ? <Text>Are you sure you want to delete this pending request to <Text style={{ fontWeight: '700' }}>{contact?.name}</Text>?</Text>
              : <Text>Remove <Text style={{ fontWeight: '700' }}>{contact?.name}</Text> from your emergency contacts?</Text>}
          </Text>
          <View style={styles.deleteActions}>
            <TouchableOpacity 
              style={styles.deleteCancelBtn} 
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel deletion"
            >
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.deleteConfirmBtn} 
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={`Confirm delete ${contact?.status === 'pending' ? 'request' : 'contact'}`}
            >
              <Text style={styles.deleteConfirmText}>
                {contact?.status === 'pending' ? 'Delete Request' : 'Remove'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  deleteCard: { backgroundColor: colors.white, borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' },
  deleteIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  deleteTitle: { fontSize: 20, fontWeight: '800', color: colors.text.primary, marginBottom: 8 },
  deleteMessage: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  deleteActions: { flexDirection: 'row', gap: 12, width: '100%' },
  deleteCancelBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  deleteCancelText: { fontSize: 15, fontWeight: '700', color: colors.text.secondary },
  deleteConfirmBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444' },
  deleteConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
