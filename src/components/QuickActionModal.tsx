import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Shadows } from '../constants/Theme';
import type { ThemeColors } from '../constants/Theme';

export type ActionConfig = {
  label: string;
  color: string;
  icon: (size: number, color: string) => React.ReactNode;
  message: string;
  detail: string;
  placeholder: string;
};

interface QuickActionModalProps {
  visible: boolean;
  config: ActionConfig | null;
  description: string;
  setDescription: (text: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  colors: ThemeColors;
}

const MAX_DESCRIPTION = 140;

export const QuickActionModal = React.memo(({
  visible,
  config,
  description,
  setDescription,
  onClose,
  onConfirm,
  loading,
  colors,
}: QuickActionModalProps) => {
  const styles = useMemo(() => getStyles(colors), [colors]);
  
  if (!config) return null;
  
  const charsLeft = MAX_DESCRIPTION - description.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={[styles.modalHeader, { backgroundColor: config.color }]} accessible={true} accessibilityRole="header">
            {config.icon(44, colors.white)}
            <Text style={styles.modalTitle}>{config.label} Emergency</Text>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalMessage}>{config.message}</Text>
            <Text style={styles.modalWarning}>{config.detail}</Text>

            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                style={[styles.descriptionInput, { color: colors.text.primary }]}
                placeholder={config.placeholder}
                placeholderTextColor={colors.text.secondary}
                value={description}
                onChangeText={text => setDescription(text.slice(0, MAX_DESCRIPTION))}
                multiline
                maxLength={MAX_DESCRIPTION}
                returnKeyType="done"
                blurOnSubmit
                accessibilityLabel="Add a brief description of the situation"
              />
              <Text style={[styles.charCount, { color: charsLeft <= 20 ? config.color : colors.text.secondary }]} accessibilityRole="text" accessibilityLabel={`${charsLeft} characters remaining`}>
                {charsLeft}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={onClose}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Cancel sending alert"
              >
                <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: config.color }, loading && { opacity: 0.7 }]}
                onPress={onConfirm}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={`Send ${config.label} Alert`}
              >
                {loading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.confirmText}>Send Alert</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

QuickActionModal.displayName = 'QuickActionModal';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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
