import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Shadows } from '../constants/Theme';
import type { ThemeColors } from '../constants/Theme';
import { QuickActionModal, ActionConfig } from './QuickActionModal';
import { showToast } from '../utils/toast';
import { useAlertContext } from '../context/AlertContext';
import type { AlertType } from '../hooks/useAlert';
import { useTheme } from '../context/ThemeContext';

export type ActionType = 'medical' | 'police' | 'fire';

export const QuickActions = React.memo(() => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [description, setDescription] = useState('');
  const { loading, triggerAlert } = useAlertContext();

  const ACTION_CONFIG = useMemo<Record<ActionType, ActionConfig>>(() => ({
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

  const handleOpen = useCallback((type: ActionType) => {
    setDescription('');
    setSelectedAction(type);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedAction(null);
    setDescription('');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedAction) return;

    const actionToTrigger = selectedAction;
    const config = ACTION_CONFIG[actionToTrigger];

    const result = await triggerAlert(actionToTrigger as AlertType, description.trim() || undefined);

    handleClose();

    if (result === 'ok') {
      setTimeout(() => {
        showToast({
          title: `${config.label} Alert Sent`,
          subtitle: description.trim()
            ? `Notified: "${description.trim()}"`
            : `Your emergency contacts have been notified.`,
          icon: 'checkmark-circle',
        });
      }, 300);
    } else if (result === 'sms') {
      setTimeout(() => {
        showToast({
          title: 'SMS Opened (Offline)',
          subtitle: 'No internet. A pre-filled message was opened.',
          icon: 'chatbubble-ellipses',
        });
      }, 300);
    } else {
      Alert.alert('Could not send request', 'Please check your connection and try again.');
    }
  }, [selectedAction, ACTION_CONFIG, triggerAlert, description, handleClose]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle} accessible={true} accessibilityRole="header">Quick Actions</Text>

      <View style={styles.row}>
        {(Object.keys(ACTION_CONFIG) as ActionType[]).map(type => {
          const config = ACTION_CONFIG[type];
          return (
            <TouchableOpacity
              key={type}
              style={styles.actionCard}
              onPress={() => handleOpen(type)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={`${config.label} quick action`}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${config.color}22` }]} aria-hidden={true}>
                {config.icon(26, config.color)}
              </View>
              <Text style={styles.actionText}>{config.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <QuickActionModal
        visible={selectedAction !== null}
        config={selectedAction ? ACTION_CONFIG[selectedAction] : null}
        description={description}
        setDescription={setDescription}
        onClose={handleClose}
        onConfirm={handleConfirm}
        loading={loading}
        colors={colors}
      />
    </View>
  );
});

QuickActions.displayName = 'QuickActions';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
});