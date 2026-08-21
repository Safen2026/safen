import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/Theme';

interface AppUpdateModalProps {
  visible: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

export const AppUpdateModal = React.memo(({ visible, onApply, onDismiss }: AppUpdateModalProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View 
          style={styles.modalContent}
          accessibilityViewIsModal={true}
          accessibilityRole="alert"
          accessibilityLabel="A new update is available"
        >
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download" size={48} color={colors.primary} />
          </View>
          
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.message}>
            A new critical update has been downloaded in the background. Restart the app to apply it immediately.
          </Text>
          
          <View style={styles.actions}>
            <TouchableOpacity 
              style={styles.dismissBtn} 
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss update prompt for now"
            >
              <Text style={styles.dismissText}>Later</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.applyBtn} 
              onPress={onApply}
              accessibilityRole="button"
              accessibilityLabel="Restart app to apply update"
            >
              <Text style={styles.applyText}>Restart Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
