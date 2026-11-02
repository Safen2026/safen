import React, { memo, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { CustomAlertModalRef, CustomAlertConfig, AlertButton, AlertType } from '../utils/customAlert';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getIconConfig = (type: AlertType) => {
  switch (type) {
    case 'error':
      return {
        name: 'alert-circle-outline' as const,
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.12)',
      };
    case 'warning':
      return {
        name: 'warning-outline' as const,
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.12)',
      };
    case 'success':
      return {
        name: 'checkmark-circle-outline' as const,
        color: '#00875A',
        bgColor: 'rgba(0, 135, 90, 0.12)',
      };
    case 'info':
    default:
      return {
        name: 'information-circle-outline' as const,
        color: '#0A2463',
        bgColor: 'rgba(10, 36, 99, 0.12)',
      };
  }
};

export const CustomAlertModal = memo(
  forwardRef<CustomAlertModalRef>((_, ref) => {
    const { colors, isDark } = useTheme();
    const [visible, setVisible] = useState(false);
    const [config, setConfig] = useState<CustomAlertConfig>({
      title: '',
      message: '',
      type: 'info',
      buttons: [],
    });

    useImperativeHandle(ref, () => ({
      show: (newConfig: CustomAlertConfig) => {
        setConfig(newConfig);
        setVisible(true);
      },
      hide: () => {
        setVisible(false);
      },
    }));

    const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

    const handleDismiss = () => {
      setVisible(false);
    };

    const handleButtonPress = (btn?: AlertButton) => {
      setVisible(false);
      if (btn?.onPress) {
        // Small delay to let modal animate out smoothly
        setTimeout(() => {
          btn.onPress?.();
        }, 100);
      }
    };

    if (!visible) return null;

    const iconCfg = getIconConfig(config.type || 'info');
    const buttons = config.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ text: 'OK', style: 'default' as const }];

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleDismiss}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.iconWrap, { backgroundColor: iconCfg.bgColor }]}>
                <Ionicons name={iconCfg.name} size={36} color={iconCfg.color} />
              </View>
              <Text style={styles.modalTitle} accessibilityRole="header">
                {config.title}
              </Text>
            </View>

            <View style={styles.modalBody}>
              {!!config.message && (
                <Text style={styles.modalMessage}>{config.message}</Text>
              )}

              <View
                style={[
                  styles.modalActions,
                  buttons.length > 2 && styles.modalActionsColumn,
                ]}
              >
                {buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  
                  return (
                    <TouchableOpacity
                      key={`${btn.text}-${index}`}
                      style={[
                        styles.buttonBase,
                        buttons.length === 2 && styles.buttonHalf,
                        isCancel && styles.cancelButton,
                        !isCancel && !isDestructive && styles.primaryButton,
                        isDestructive && styles.destructiveButton,
                      ]}
                      onPress={() => handleButtonPress(btn)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={btn.text}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          isCancel && styles.cancelButtonText,
                          (!isCancel || isDestructive) && styles.primaryButtonText,
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  })
);

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      width: '100%',
      maxWidth: Math.min(SCREEN_WIDTH - 48, 380),
      backgroundColor: colors.white,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    modalHeader: {
      paddingTop: 28,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      color: colors.text.primary,
      fontSize: 20,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    modalBody: {
      padding: 24,
      paddingTop: 12,
    },
    modalMessage: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalActionsColumn: {
      flexDirection: 'column',
    },
    buttonBase: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonHalf: {
      flex: 1,
    },
    cancelButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    destructiveButton: {
      backgroundColor: '#EF4444',
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    cancelButtonText: {
      color: colors.text.primary,
    },
    primaryButtonText: {
      color: '#ffffff',
    },
  });
