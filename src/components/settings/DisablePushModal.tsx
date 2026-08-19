import React, { memo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../../constants/Theme';

interface DisablePushModalProps {
  visible: boolean;
  colors: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DisablePushModal = memo(function DisablePushModal({ visible, colors, onCancel, onConfirm }: DisablePushModalProps) {
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
            <Ionicons name="notifications-off-outline" size={48} color="#EF4444" />
            <Text style={styles.modalTitle}>Disable Alerts?</Text>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalMessage}>Are you sure you want to turn off Push Notifications?</Text>
            <Text style={styles.modalWarning}>
              If disabled, you will not be notified when your emergency contacts trigger an SOS or share reports with you!
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Keep Push Notifications On"
              >
                <Text style={styles.cancelText}>Keep On</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmButton} 
                onPress={onConfirm}
                accessibilityRole="button"
                accessibilityLabel="Turn Off Push Notifications"
              >
                <Text style={styles.confirmText}>Turn Off</Text>
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
