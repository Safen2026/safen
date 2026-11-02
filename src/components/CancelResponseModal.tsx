import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';

interface CancelResponseModalProps {
  visible: boolean;
  loading: boolean;
  onKeepHelping: () => void;
  onConfirmCancel: () => void;
}

export const CancelResponseModal = memo(function CancelResponseModal({
  visible,
  loading,
  onKeepHelping,
  onConfirmCancel,
}: CancelResponseModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKeepHelping}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#EF4444" />
            </View>
            <Text style={styles.modalTitle}>Cancel Response?</Text>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalWarning}>
              Are you sure you want to cancel? The person in need will be notified that you are no longer en route.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.keepHelpingButton}
                onPress={onKeepHelping}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Keep Helping with this emergency"
              >
                <Text style={styles.keepHelpingText}>Keep Helping</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelButton, loading && { opacity: 0.7 }]}
                onPress={onConfirmCancel}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Confirm cancel response"
              >
                {loading ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <Text style={styles.cancelText}>Cancel Response</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});

CancelResponseModal.displayName = 'CancelResponseModal';

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      width: '100%',
      backgroundColor: isDark ? '#1F2937' : colors.white,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? '#374151' : colors.border,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
    },
    modalHeader: {
      paddingTop: 28,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      color: isDark ? '#F9FAFB' : colors.text.primary,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    modalBody: {
      padding: 24,
      paddingTop: 12,
    },
    modalWarning: {
      fontSize: 14,
      color: isDark ? '#9CA3AF' : colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    modalActions: {
      gap: 10,
    },
    keepHelpingButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#16A34A',
    },
    keepHelpingText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 15,
    },
    cancelButton: {
      width: '100%',
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
    },
    cancelText: {
      color: isDark ? '#FCA5A5' : '#DC2626',
      fontWeight: '700',
      fontSize: 14,
    },
  });
