import React, { memo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../../constants/Theme';

interface DeleteAccountModalProps {
  visible: boolean;
  deleting: boolean;
  colors: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteAccountModal = memo(function DeleteAccountModal({ visible, deleting, colors, onCancel, onConfirm }: DeleteAccountModalProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" />
            <Text style={styles.modalTitle}>Delete Account?</Text>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalMessage}>This action is permanent and cannot be undone.</Text>
            <Text style={styles.modalWarning}>
              All of your safety data, emergency contacts, and settings will be permanently wiped from our servers immediately.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={onCancel} 
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel Delete Account"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmButton, deleting && { opacity: 0.7 }]} 
                onPress={onConfirm} 
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Confirm Delete Account"
              >
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Delete Forever</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  modalHeader: { padding: 24, paddingBottom: 0, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: colors.text.primary, fontSize: 22, fontWeight: 'bold', marginTop: 12, letterSpacing: 0.5 },
  modalBody: { padding: 24 },
  modalMessage: { fontSize: 18, color: colors.text.primary, textAlign: 'center', fontWeight: '700', marginBottom: 8 },
  modalWarning: { fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  cancelText: { color: colors.text.secondary, fontWeight: '700', fontSize: 16 },
  confirmButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
  confirmText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
});
