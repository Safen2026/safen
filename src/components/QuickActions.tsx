import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Colors, Shadows } from '../constants/Theme';
import { useAlert, AlertType } from '../hooks/useAlert';

type ActionType = 'medical' | 'police' | 'fire';

const ACTION_CONFIG = {
  medical: {
    label: 'Medical',
    color: Colors.icon.medical,
    icon: (size: number, color: string) => <MaterialCommunityIcons name="medical-bag" size={size} color={color} />,
    message: 'Request immediate medical assistance.',
  },
  police: {
    label: 'Police',
    color: Colors.icon.police,
    icon: (size: number, color: string) => <MaterialCommunityIcons name="police-badge-outline" size={size} color={color} />,
    message: 'Request immediate police response.',
  },
  fire: {
    label: 'Fire',
    color: Colors.icon.fire,
    icon: (size: number, color: string) => <MaterialIcons name="local-fire-department" size={size} color={color} />,
    message: 'Report a fire or request rescue services.',
  },
};

export const QuickActions = () => {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const { loading, triggerAlert } = useAlert();

  const handleConfirm = async () => {
    if (!selectedAction) return;
    const success = await triggerAlert(selectedAction as AlertType);
    setSelectedAction(null);

    if (success) {
      const label = ACTION_CONFIG[selectedAction].label;
      Alert.alert(
        `${label} Request Sent`,
        `Your ${label.toLowerCase()} alert has been logged with your location. Responders have been notified.`
      );
    } else {
      Alert.alert('Error', 'Could not send request. Please check your connection and try again.');
    }
  };

  return (
    <View style={styles.container}>
      {(Object.keys(ACTION_CONFIG) as ActionType[]).map(type => {
        const config = ACTION_CONFIG[type];
        return (
          <TouchableOpacity
            key={type}
            style={styles.actionButton}
            onPress={() => setSelectedAction(type)}
            disabled={loading}
          >
            {config.icon(28, config.color)}
            <Text style={styles.actionText}>{config.label}</Text>
          </TouchableOpacity>
        );
      })}

      <Modal
        visible={selectedAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAction(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedAction && (() => {
            const config = ACTION_CONFIG[selectedAction];
            return (
              <View style={styles.modalContent}>
                <View style={[styles.modalHeader, { backgroundColor: config.color }]}>
                  {config.icon(48, Colors.white)}
                  <Text style={styles.modalTitle}>{config.label} Emergency</Text>
                </View>
                <View style={styles.modalBody}>
                  <Text style={styles.modalMessage}>{config.message}</Text>
                  <Text style={styles.modalWarning}>
                    This will log your live location and notify emergency responders.
                  </Text>
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setSelectedAction(null)}
                      disabled={loading}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmButton, { backgroundColor: config.color }, loading && { opacity: 0.7 }]}
                      onPress={handleConfirm}
                      disabled={loading}
                    >
                      {loading
                        ? <ActivityIndicator color={Colors.white} />
                        : <Text style={styles.confirmText}>Send Request</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10, marginBottom: 20, backgroundColor: Colors.background },
  actionButton: { width: '30%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 15, alignItems: 'center', ...Shadows.sm },
  actionText: { marginTop: 8, fontSize: 13, fontWeight: '600', color: Colors.text.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', ...Shadows.md },
  modalHeader: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: Colors.white, fontSize: 22, fontWeight: 'bold', marginTop: 12, letterSpacing: 0.5 },
  modalBody: { padding: 24 },
  modalMessage: { fontSize: 18, color: Colors.text.primary, textAlign: 'center', fontWeight: '700', marginBottom: 8 },
  modalWarning: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  cancelText: { color: Colors.text.secondary, fontWeight: '700', fontSize: 16 },
  confirmButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...Shadows.sm },
  confirmText: { color: Colors.white, fontWeight: 'bold', fontSize: 16 },
});