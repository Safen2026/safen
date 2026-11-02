import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../context/HapticsContext';
import {
  BroadcastScope,
  SCOPE_OPTIONS,
} from '../utils/broadcastScope';
import type { ThemeColors } from '../constants/Theme';

interface BroadcastScopeModalProps {
  visible: boolean;
  currentScope: BroadcastScope;
  onSelect: (scope: BroadcastScope) => void;
  onClose: () => void;
  source?: 'home' | 'settings';
}

const BROADCAST_SCOPES: readonly BroadcastScope[] = ['both', 'contacts_only'] as const;

export const BroadcastScopeModal = React.memo(({
  visible,
  currentScope,
  onSelect,
  onClose,
  source = 'home',
}: BroadcastScopeModalProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { triggerHaptic } = useHaptics();

  const handleSelect = useCallback((scope: BroadcastScope) => {
    triggerHaptic();
    onSelect(scope);
    onClose();
  }, [triggerHaptic, onSelect, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="radio-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>Emergency Broadcast Scope</Text>
                <Text style={styles.subtitle}>Choose who receives your SOS alerts</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close broadcast scope selector"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {BROADCAST_SCOPES.map((scopeKey) => {
              const meta = SCOPE_OPTIONS[scopeKey];
              const isSelected = currentScope === scopeKey;

              return (
                <TouchableOpacity
                  key={scopeKey}
                  style={[
                    styles.optionCard,
                    isSelected && styles.optionCardSelected,
                  ]}
                  onPress={() => handleSelect(scopeKey)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.optionHeader}>
                    <View style={styles.optionTitleRow}>
                      <View style={[styles.badgeIcon, { backgroundColor: isSelected ? meta.accentColor + '20' : colors.background }]}>
                        <Ionicons
                          name={meta.icon}
                          size={18}
                          color={isSelected ? meta.accentColor : colors.text.secondary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, isSelected && { color: colors.text.primary }]}>
                          {meta.title}
                        </Text>
                        {scopeKey === 'both' ? (
                          <Text style={[styles.recBadge, { color: meta.accentColor, borderColor: meta.accentColor + '40' }]}>
                            RECOMMENDED
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Radio circle */}
                    <View style={[styles.radioCircle, isSelected && { borderColor: meta.accentColor, backgroundColor: meta.accentColor }]}>
                      {isSelected ? (
                        <View style={styles.radioDot} />
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.optionDesc}>
                    {meta.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Note / Info — only shown when managing defaults from Settings */}
          {source === 'settings' && (
            <View style={styles.footerNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
              <Text style={styles.footerNoteText}>
                You can quickly switch your audience at any time directly below the SOS button before triggering.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
});

BroadcastScopeModal.displayName = 'BroadcastScopeModal';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  badgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  recBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 4,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  optionDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  footerNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
  },
});
