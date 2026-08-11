import React, { useState, useMemo } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, TextInput 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Shadows } from '../constants/Theme';

interface JourneySetupModalProps {
  visible: boolean;
  onClose: () => void;
  onStart: (destination: string, mode: string) => void;
}

const PRESETS = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'work', label: 'Work', icon: 'briefcase-outline' },
  { id: 'gym', label: 'Gym', icon: 'dumbbell' },
];

const MODES = [
  { id: 'walking', label: 'Walk', icon: 'walk' },
  { id: 'cycling', label: 'Cycle', icon: 'bike' },
  { id: 'transit', label: 'Public Transport', icon: 'bus' },
  { id: 'driving', label: 'Drive', icon: 'car-outline' },
];

export const JourneySetupModal = ({ visible, onClose, onStart }: JourneySetupModalProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [destination, setDestination] = useState('Home');
  const [customDest, setCustomDest] = useState('');
  const [mode, setMode] = useState('driving');

  const handleStart = () => {
    const finalDest = customDest.trim() || destination;
    if (!finalDest) return;
    onStart(finalDest, mode);
  };

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
            {PRESETS.map(p => {
              const isSelected = destination === p.label && !customDest;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.presetChip,
                    { borderColor: isSelected ? colors.primary : colors.border },
                    isSelected && { backgroundColor: `${colors.primary}10` }
                  ]}
                  onPress={() => {
                    setDestination(p.label);
                    setCustomDest('');
                  }}
                >
                  <MaterialCommunityIcons 
                    name={p.icon as any} 
                    size={20} 
                    color={isSelected ? colors.primary : colors.text.secondary} 
                  />
                  <Text style={[
                    styles.presetText, 
                    { color: isSelected ? colors.primary : colors.text.secondary }
                  ]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          <TextInput
            style={[
              styles.input,
              { borderColor: customDest ? colors.primary : colors.border, color: colors.text.primary }
            ]}
            placeholder="Or type a custom destination..."
            placeholderTextColor={colors.text.secondary}
            value={customDest}
            onChangeText={(t) => {
              setCustomDest(t);
              setDestination('');
            }}
          />

          <Text style={styles.sectionLabel}>How are you getting there?</Text>
          <View style={styles.modeRow}>
            {MODES.map(m => {
              const isSelected = mode === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.modeCard,
                    { borderColor: isSelected ? colors.primary : colors.border },
                    isSelected && { backgroundColor: `${colors.primary}10` }
                  ]}
                  onPress={() => setMode(m.id)}
                >
                  <MaterialCommunityIcons 
                    name={m.icon as any} 
                    size={24} 
                    color={isSelected ? colors.primary : colors.text.secondary} 
                  />
                  <Text style={[
                    styles.modeText,
                    { color: isSelected ? colors.primary : colors.text.secondary }
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.cancelBtn, { borderColor: colors.border }]} 
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.startBtn, { backgroundColor: colors.primary }]} 
              onPress={handleStart}
            >
              <Text style={styles.startText}>Start Sharing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
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
