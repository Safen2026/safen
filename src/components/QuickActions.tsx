import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Colors, Shadows } from '../constants/Theme';

type ActionType = 'medical' | 'police' | 'fire';

export const QuickActions = () => {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);

  const getActionDetails = (type: ActionType) => {
    switch(type) {
      case 'medical':
        return {
          title: 'Medical',
          color: Colors.icon.medical,
          icon: <MaterialCommunityIcons name="medical-bag" size={48} color={Colors.white} />,
          message: 'Request immediate medical assistance.'
        };
      case 'police':
        return {
          title: 'Police',
          color: Colors.icon.police,
          icon: <MaterialCommunityIcons name="police-badge-outline" size={48} color={Colors.white} />,
          message: 'Request immediate police response.'
        };
      case 'fire':
        return {
          title: 'Fire',
          color: Colors.icon.fire,
          icon: <MaterialIcons name="local-fire-department" size={48} color={Colors.white} />,
          message: 'Report a fire or request rescue services.'
        };
    }
  };

  const handleConfirm = () => {
    if (selectedAction) {
      const details = getActionDetails(selectedAction);
      Alert.alert(
        `${details.title} Request Sent`,
        `Your request for ${details.title.toLowerCase()} assistance has been dispatched. Responders will receive your live location shortly.`
      );
      setSelectedAction(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.actionButton} onPress={() => setSelectedAction('medical')}>
        <MaterialCommunityIcons name="medical-bag" size={28} color={Colors.icon.medical} />
        <Text style={styles.actionText}>Medical</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.actionButton} onPress={() => setSelectedAction('police')}>
        <MaterialCommunityIcons name="police-badge-outline" size={28} color={Colors.icon.police} />
        <Text style={styles.actionText}>Police</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.actionButton} onPress={() => setSelectedAction('fire')}>
        <MaterialIcons name="local-fire-department" size={28} color={Colors.icon.fire} />
        <Text style={styles.actionText}>Fire</Text>
      </TouchableOpacity>

      <Modal
        visible={selectedAction !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedAction(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedAction && (() => {
            const details = getActionDetails(selectedAction);
            return (
              <View style={styles.modalContent}>
                <View style={[styles.modalHeader, { backgroundColor: details.color }]}>
                  {details.icon}
                  <Text style={styles.modalTitle}>{details.title} Emergency</Text>
                </View>
                
                <View style={styles.modalBody}>
                  <Text style={styles.modalMessage}>{details.message}</Text>
                  <Text style={styles.modalWarning}>This will share your live location with emergency responders.</Text>
                  
                  <View style={styles.modalActions}>
                    <TouchableOpacity 
                      style={styles.cancelButton}
                      activeOpacity={0.7}
                      onPress={() => setSelectedAction(null)}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.confirmButton, { backgroundColor: details.color }]}
                      activeOpacity={0.8}
                      onPress={handleConfirm}
                    >
                      <Text style={styles.confirmText}>Send Request</Text>
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
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: Colors.background,
  },
  actionButton: {
    width: '30%',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    ...Shadows.sm,
  },
  actionText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.md,
  },
  modalHeader: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    letterSpacing: 0.5,
  },
  modalBody: {
    padding: 24,
  },
  modalMessage: {
    fontSize: 18,
    color: Colors.text.primary,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 8,
  },
  modalWarning: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  cancelText: {
    color: Colors.text.secondary,
    fontWeight: '700',
    fontSize: 16,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  confirmText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
