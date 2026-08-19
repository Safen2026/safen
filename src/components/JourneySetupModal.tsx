import React, { useState, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, TextInput 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { Shadows } from '../constants/Theme';

interface JourneySetupModalProps {
  visible: boolean;
  onClose: () => void;
  onStart: (destination: string, mode: string) => void;
}

type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const PRESETS: { id: string; label: string; icon: MCIName }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'work', label: 'Work', icon: 'briefcase-outline' },
  { id: 'gym', label: 'Gym', icon: 'dumbbell' },
];

const MODES: { id: string; label: string; icon: MCIName }[] = [
  { id: 'walking', label: 'Walk', icon: 'walk' },
  { id: 'cycling', label: 'Cycle', icon: 'bike' },
  { id: 'transit', label: 'Public Transport', icon: 'bus' },
  { id: 'driving', label: 'Drive', icon: 'car-outline' },
];

const PresetChip = React.memo(({ item, isSelected, colors, styles, onSelect }: any) => {
  const handlePress = useCallback(() => onSelect(item.label), [item.label, onSelect]);
  return (
    <TouchableOpacity
      style={[
        styles.presetChip,
        { borderColor: isSelected ? colors.primary : colors.border },
        isSelected && { backgroundColor: `${colors.primary}10` }
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Preset destination: ${item.label}`}
      accessibilityState={{ selected: isSelected }}
    >
      <MaterialCommunityIcons 
        name={item.icon} 
        size={20} 
        color={isSelected ? colors.primary : colors.text.secondary} 
      />
      <Text style={[
        styles.presetText, 
        { color: isSelected ? colors.primary : colors.text.secondary }
      ]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

const ModeCard = React.memo(({ item, isSelected, colors, styles, onSelect }: any) => {
  const handlePress = useCallback(() => onSelect(item.id), [item.id, onSelect]);
  return (
    <TouchableOpacity
      style={[
        styles.modeCard,
        { borderColor: isSelected ? colors.primary : colors.border },
        isSelected && { backgroundColor: `${colors.primary}10` }
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Transport mode: ${item.label}`}
      accessibilityState={{ selected: isSelected }}
    >
      <MaterialCommunityIcons 
        name={item.icon} 
        size={24} 
        color={isSelected ? colors.primary : colors.text.secondary} 
      />
      <Text style={[
        styles.modeText,
        { color: isSelected ? colors.primary : colors.text.secondary }
      ]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

export const JourneySetupModalComponent = ({ visible, onClose, onStart }: JourneySetupModalProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [destination, setDestination] = useState('Home');
  const [customDest, setCustomDest] = useState('');
  const [mode, setMode] = useState('driving');

  const handleStart = useCallback(() => {
    const finalDest = customDest.trim() || destination;
    if (!finalDest) return;
    onStart(finalDest, mode);
  }, [customDest, destination, mode, onStart]);

  const handlePresetSelect = useCallback((label: string) => {
    setDestination(label);
    setCustomDest('');
  }, []);

  const handleCustomDestChange = useCallback((t: string) => {
    setCustomDest(t);
    setDestination('');
  }, []);

  const handleModeSelect = useCallback((id: string) => {
    setMode(id);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          <View style={styles.handle} />
          
          <Text style={styles.title}>Start a Journey</Text>
          <Text style={styles.subtitle}>Share your progress with your emergency contacts in real time.</Text>

          <Text style={styles.sectionLabel}>Where are you going?</Text>
          <View style={styles.presetRow}>
            {PRESETS.map(p => (
              <PresetChip 
                key={p.id} 
                item={p} 
                isSelected={destination === p.label && !customDest} 
                colors={colors} 
                styles={styles} 
                onSelect={handlePresetSelect} 
              />
            ))}
          </View>
          
          <TextInput
            style={[
              styles.input,
              { borderColor: customDest ? colors.primary : colors.border, color: colors.text.primary }
            ]}
            placeholder="Or type a custom destination..."
            placeholderTextColor={colors.text.secondary}
            value={customDest}
            onChangeText={handleCustomDestChange}
            accessibilityLabel="Custom destination input"
          />

          <Text style={styles.sectionLabel}>How are you getting there?</Text>
          <View style={styles.modeRow}>
            {MODES.map(m => (
              <ModeCard 
                key={m.id} 
                item={m} 
                isSelected={mode === m.id} 
                colors={colors} 
                styles={styles} 
                onSelect={handleModeSelect} 
              />
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.cancelBtn, { borderColor: colors.border }]} 
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel journey setup"
            >
              <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.startBtn, { backgroundColor: colors.primary }]} 
              onPress={handleStart}
              accessibilityRole="button"
              accessibilityLabel="Start sharing journey"
            >
              <Text style={styles.startText}>Start Sharing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const JourneySetupModal = React.memo(JourneySetupModalComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    ...Shadows.lg,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  presetChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  presetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 24,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
  },
  startBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...Shadows.sm,
  },
  startText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
