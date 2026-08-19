import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { Shadows } from '../constants/Theme';
import { TripShareContact } from '../hooks/useShareLiveTrip';
import { Avatar } from './Avatar';

interface ShareTripModalProps {
  visible: boolean;
  contact: TripShareContact | null;
  isStarting: boolean;
  onClose: () => void;
  onStart: (durationMinutes: number) => void;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const DURATIONS: { label: string; minutes: number; icon: IoniconsName }[] = [
  { label: '15 min', minutes: 15, icon: 'time-outline' },
  { label: '30 min', minutes: 30, icon: 'time-outline' },
  { label: '1 hour', minutes: 60, icon: 'timer-outline' },
  { label: 'Until I stop', minutes: 0, icon: 'infinite-outline' },
];

const DurationCard = React.memo(({ item, isSelected, colors, styles, onSelect }: any) => {
  const handlePress = useCallback(() => onSelect(item.minutes), [item.minutes, onSelect]);
  return (
    <TouchableOpacity
      style={[
        styles.durationCard,
        { borderColor: isSelected ? colors.primary : colors.border },
        isSelected && { backgroundColor: `${colors.primary}12` },
      ]}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Share for ${item.label}`}
      accessibilityState={{ selected: isSelected }}
    >
      <Ionicons
        name={item.icon}
        size={22}
        color={isSelected ? colors.primary : colors.text.secondary}
      />
      <Text style={[styles.durationText, { color: isSelected ? colors.primary : colors.text.secondary }]}>
        {item.label}
      </Text>
      {isSelected && (
        <View style={[styles.selectedDot, { backgroundColor: colors.primary }]} />
      )}
    </TouchableOpacity>
  );
});

export const ShareTripModalComponent = ({
  visible,
  contact,
  isStarting,
  onClose,
  onStart,
}: ShareTripModalProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [selectedDuration, setSelectedDuration] = useState(30);

  const handleStart = useCallback(() => {
    if (!contact) return;
    onStart(selectedDuration);
  }, [contact, selectedDuration, onStart]);

  if (!contact) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Avatar name={contact.name} size={52} />
            <View style={styles.headerText}>
              <Text style={styles.title}>Share Live Location</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                with <Text style={{ color: colors.primary, fontWeight: '700' }}>{contact.name}</Text>
              </Text>
            </View>
          </View>

          {/* Info row */}
          <View style={[styles.infoBox, { backgroundColor: `${colors.primary}0D` }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              Only {contact.name.split(' ')[0]} will see your location. Sharing stops automatically.
            </Text>
          </View>

          {/* Duration picker */}
          <Text style={styles.sectionLabel}>How long do you want to share?</Text>
          <View style={styles.durationGrid}>
            {DURATIONS.map(d => (
              <DurationCard
                key={d.minutes}
                item={d}
                isSelected={selectedDuration === d.minutes}
                colors={colors}
                styles={styles}
                onSelect={setSelectedDuration}
              />
            ))}
          </View>

          {/* What the contact sees note */}
          <View style={[styles.noteRow, { borderColor: colors.border }]}>
            <Ionicons name="eye-outline" size={15} color={colors.text.secondary} />
            <Text style={[styles.noteText, { color: colors.text.secondary }]}>
              {contact.name.split(' ')[0]} will receive a notification and can tap it to see your location on a map.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={isStarting}
              accessibilityRole="button"
              accessibilityLabel="Cancel sharing"
            >
              <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.primary }, isStarting && { opacity: 0.7 }]}
              onPress={handleStart}
              disabled={isStarting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Start sharing live location"
            >
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={styles.startText}>
                {isStarting ? 'Starting...' : 'Start Sharing'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const ShareTripModal = React.memo(ShareTripModalComponent);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginBottom: 22,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  durationCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
    position: 'relative',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 20,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
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
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  startBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  startText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
