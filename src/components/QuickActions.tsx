import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Shadows } from '../constants/Theme';
import { ConfirmationModal } from './ConfirmationModal';
import { useAlert, AlertType } from '../hooks/useAlert';
import { useTheme } from '../context/ThemeContext';

type ActionType = 'medical' | 'police' | 'fire';

const MAX_DESCRIPTION = 140;

export const QuickActions = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [description, setDescription] = useState('');
  const { loading, triggerAlert } = useAlert();
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: '',
    msg: '',
    icon: 'checkmark-circle',
    color: colors.primary,
  });

  const ACTION_CONFIG = useMemo(() => ({
    medical: {
      label  : 'Medical',
      color  : colors.icon.medical,
      icon   : (size: number, color: string) => <MaterialCommunityIcons name="medical-bag" size={size} color={color} />,
      message: 'Alert your emergency contacts about a medical situation.',
      detail : 'Your contacts will receive your location and a medical alert.',
      placeholder: 'e.g. "Chest pain, need ambulance" (optional)',
    },
    police: {
      label  : 'Security',
      color  : colors.icon.police,
      icon   : (size: number, color: string) => <MaterialCommunityIcons name="shield-check-outline" size={size} color={color} />,
      message: 'Alert your emergency contacts about a security situation.',
      detail : 'Your contacts will receive your location and a security alert.',
      placeholder: 'e.g. "Suspicious person following me" (optional)',
    },
    fire: {
      label  : 'Fire',
      color  : colors.icon.fire,
      icon   : (size: number, color: string) => <MaterialIcons name="local-fire-department" size={size} color={color} />,
      message: 'Alert your emergency contacts about a fire situation.',
      detail : 'Your contacts will receive your location and a fire alert.',
      placeholder: 'e.g. "Building fire, evacuation in progress" (optional)',
    },
  }), [colors]);

  const handleOpen = (type: ActionType) => {
    setDescription('');
    setSelectedAction(type);
  };

  const handleClose = () => {
    setSelectedAction(null);
    setDescription('');
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;

    const actionToTrigger = selectedAction;
    const config = ACTION_CONFIG[actionToTrigger];

    const success = await triggerAlert(actionToTrigger as AlertType, description.trim() || undefined);

    handleClose();

    if (success) {
      setTimeout(() => {
        setConfirmModal({
          visible: true,
          title: `${config.label} Alert Sent`,
          msg: description.trim()
            ? `Your contacts have been notified: "${description.trim()}"`
            : `Your emergency contacts have been notified of a ${config.label.toLowerCase()} situation and can see your current location.`,
          icon: 'checkmark-circle',
          color: config.color,
        });
      }, 300);
    } else {
      Alert.alert('Error', 'Could not send request. Please check your connection and try again.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      {/* Action cards */}
      <View style={styles.row}>
        {(Object.keys(ACTION_CONFIG) as ActionType[]).map(type => {
          const config = ACTION_CONFIG[type];
          return (
            <TouchableOpacity
              key={type}
              style={styles.actionCard}
              onPress={() => handleOpen(type)}
              disabled={loading}
              accessibilityLabel={`${config.label} quick action`}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${config.color}22` }]}>
                {config.icon(26, config.color)}
              </View>
              <Text style={styles.actionText}>{config.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Confirmation modal with optional description input */}
      <Modal
        visible={selectedAction !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          {selectedAction && (() => {
            const config = ACTION_CONFIG[selectedAction];
            const charsLeft = MAX_DESCRIPTION - description.length;
            return (
              <View style={styles.modalContent}>
                {/* Coloured header */}
                <View style={[styles.modalHeader, { backgroundColor: config.color }]}>
                  {config.icon(44, colors.white)}
                  <Text style={styles.modalTitle}>{config.label} Emergency</Text>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.modalMessage}>{config.message}</Text>
                  <Text style={styles.modalWarning}>{config.detail}</Text>

                  {/* Optional description input */}
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <TextInput
                      style={[styles.descriptionInput, { color: colors.text.primary }]}
                      placeholder={config.placeholder}
                      placeholderTextColor={colors.text.secondary}
                      value={description}
                      onChangeText={t => setDescription(t.slice(0, MAX_DESCRIPTION))}
                      multiline
                      maxLength={MAX_DESCRIPTION}
                      returnKeyType="done"
                      blurOnSubmit
                      accessibilityLabel="Add a brief description of the situation"
                    />
                    <Text style={[styles.charCount, { color: charsLeft <= 20 ? config.color : colors.text.secondary }]}>
                      {charsLeft}
                    </Text>
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.cancelButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                      onPress={handleClose}
                      disabled={loading}
                    >
                      <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmButton, { backgroundColor: config.color }, loading && { opacity: 0.7 }]}
                      onPress={handleConfirm}
                      disabled={loading}
                    >
                      {loading
                        ? <ActivityIndicator color={colors.white} />
                        : <Text style={styles.confirmText}>Send Alert</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })()}
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.msg}
        iconName={confirmModal.icon}
        iconColor={confirmModal.color}
        onClose={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.white,
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
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10,
    letterSpacing: 0.4,
  },
  modalBody: {
    padding: 20,
  },
  modalMessage: {
    fontSize: 16,
    color: colors.text.primary,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 6,
  },
  modalWarning: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },

  // Description input
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 16,
    minHeight: 70,
  },
  descriptionInput: {
    fontSize: 14,
    lineHeight: 20,
    minHeight: 44,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },

  // Buttons
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  confirmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});