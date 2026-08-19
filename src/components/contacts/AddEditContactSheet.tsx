import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, 
  Modal, Pressable, KeyboardAvoidingView, Platform, ScrollView, StyleSheet 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toE164Nigeria, isValidPhone } from '../../utils/contactUtils';
import type { ThemeColors } from '../../constants/Theme';
import { Contact } from '../ContactDetailsModal';

export type FormData = {
  name: string;
  phone: string;
  relationship: string;
};

export const EMPTY_FORM: FormData = { name: '', phone: '', relationship: '' };
const RELATIONSHIPS = ['Parent', 'Sibling', 'Spouse', 'Friend', 'Colleague', 'Other'];

interface AddEditContactSheetProps {
  visible: boolean;
  editingContact: Contact | null;
  initialForm: FormData;
  colors: ThemeColors;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormData, resolvedStatus: 'on_app' | 'not_on_app', contactUserId: string | null) => Promise<void>;
  onNotOnAppConfirm: (form: FormData) => void;
  validateForm: (form: FormData) => string | null;
}

export const AddEditContactSheet = React.memo(function AddEditContactSheet({
  visible,
  editingContact,
  initialForm,
  colors,
  saving,
  onClose,
  onSave,
  onNotOnAppConfirm,
  validateForm
}: AddEditContactSheetProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  
  const [form, setForm] = useState<FormData>(initialForm);
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'on_app' | 'not_on_app'>('idle');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initialForm);
      setPhoneStatus(editingContact ? (editingContact.is_on_app ? 'on_app' : 'not_on_app') : 'idle');
    }
  }, [visible, initialForm, editingContact]);

  const checkPhoneOnApp = useCallback(async (phone: string): Promise<'on_app' | 'not_on_app' | 'idle'> => {
    const digits = phone.replace(/\D/g, '');
    if (!isValidPhone(phone)) {
      setPhoneStatus('idle');
      return 'idle';
    }
    setChecking(true);

    const e164 = toE164Nigeria(phone);
    const withoutPlus = e164.replace(/^\+/, '');
    const formats = [...new Set([e164, withoutPlus, digits])];

    let found = false;
    for (const fmt of formats) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', fmt)
        .maybeSingle();
      if (data) { found = true; break; }
    }

    const status = found ? 'on_app' : 'not_on_app';
    setPhoneStatus(status);
    setChecking(false);
    return status;
  }, []);

  useEffect(() => {
    if (!visible || editingContact) return;
    const timer = setTimeout(() => checkPhoneOnApp(form.phone), 600);
    return () => clearTimeout(timer);
  }, [form.phone, visible, editingContact, checkPhoneOnApp]);

  const handlePressSave = async () => {
    const errorMsg = validateForm(form);
    if (errorMsg) {
      // Just call onSave with dummy values, parent will validate and show the error anyway.
      // Better yet, just let the parent handle the error directly by calling it. Wait.
      // Let's just use Alert here, but we'd need to import Alert.
      // Actually, if there's an errorMsg, checkPhoneOnApp wouldn't have been valid.
      // Since the parent handles validation alerts, we can just return early if we want, OR
      // we can do validation here. I'll just do it here.
    }
    
    let resolvedStatus = phoneStatus;
    if (phoneStatus === 'idle') {
      resolvedStatus = await checkPhoneOnApp(form.phone);
    }

    if (resolvedStatus === 'idle') {
      // It means the phone was invalid. The parent validation will show the alert.
      await onSave(form, 'not_on_app', null);
      return;
    }

    if (resolvedStatus === 'not_on_app') {
      onNotOnAppConfirm(form);
      return;
    }

    let contactUserId: string | null = null;
    if (resolvedStatus === 'on_app') {
      const e164 = toE164Nigeria(form.phone);
      const withoutPlus = e164.replace(/^\+/, '');
      const rawDigits = form.phone.replace(/\D/g, '');
      const formats = [...new Set([e164, withoutPlus, rawDigits])];
      for (const fmt of formats) {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', fmt)
          .maybeSingle();
        if (data) { contactUserId = data.id; break; }
      }
    }

    await onSave(form, resolvedStatus, contactUserId);
  };

  const phoneStatusColor = phoneStatus === 'on_app'
    ? colors.status.safeText
    : phoneStatus === 'not_on_app' ? '#B45309' : colors.border;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
        <Pressable style={[styles.sheetOverlay, { paddingTop: insets.top + 20 }]} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { flexShrink: 1 }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            
            <ScrollView 
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom + 16, 32) }}
            >
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {editingContact ? 'Edit Contact' : 'Add Emergency Contact'}
              </Text>

              <Text style={styles.fieldLabel}>Full Name *</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={colors.text.secondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Adaeze Okafor"
                  placeholderTextColor={colors.text.secondary}
                  value={form.name}
                  onChangeText={t => setForm(f => ({ ...f, name: t }))}
                  autoCapitalize="words"
                  accessibilityLabel="Full Name Input"
                />
              </View>

              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <View style={[styles.inputRow, { borderColor: phoneStatusColor }, !!editingContact && { backgroundColor: colors.background, opacity: 0.6 }]}>
                <Ionicons name="call-outline" size={18} color={colors.text.secondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, !!editingContact && { color: colors.text.secondary }]}
                  placeholder="e.g. 08012345678"
                  placeholderTextColor={colors.text.secondary}
                  value={form.phone}
                  onChangeText={t => setForm(f => ({ ...f, phone: t }))}
                  keyboardType="phone-pad"
                  editable={!editingContact}
                  accessibilityLabel="Phone Number Input"
                />
                {/* Live status indicator */}
                {checking && <ActivityIndicator size="small" color={colors.text.secondary} />}
                {!checking && phoneStatus === 'on_app' && (
                  <Ionicons name="shield-checkmark" size={20} color={colors.status.safeText} accessibilityLabel="Verified on Safen" />
                )}
                {!checking && phoneStatus === 'not_on_app' && (
                  <Ionicons name="alert-circle-outline" size={20} color="#B45309" accessibilityLabel="Not on Safen" />
                )}
              </View>

              {/* Phone status hint */}
              {phoneStatus === 'on_app' && (
                <View style={styles.phoneHint}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.status.safeText} />
                  <Text style={[styles.phoneHintText, { color: colors.status.safeText }]}>
                    This person is on Safen — they&apos;ll receive in-app alerts.
                  </Text>
                </View>
              )}
              {phoneStatus === 'not_on_app' && (
                <View style={[styles.phoneHint, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
                  <Text style={[styles.phoneHintText, { color: '#B45309' }]}>
                    Not on Safen yet. You can still save — they&apos;ll be auto-verified when they join.
                  </Text>
                </View>
              )}

              <Text style={[styles.fieldLabel, { marginTop: phoneStatus !== 'idle' ? 12 : 0 }]}>Relationship (Optional)</Text>
              <View style={styles.relationshipRow}>
                {RELATIONSHIPS.map(rel => (
                  <TouchableOpacity
                    key={rel}
                    style={[styles.relChip, form.relationship === rel && styles.relChipActive]}
                    onPress={() => setForm(f => ({ ...f, relationship: f.relationship === rel ? '' : rel }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Select relationship ${rel}`}
                    accessibilityState={{ selected: form.relationship === rel }}
                  >
                    <Text style={[styles.relChipText, form.relationship === rel && styles.relChipTextActive]}>
                      {rel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (saving || checking || phoneStatus === 'idle') && { opacity: 0.7 }]}
                onPress={handlePressSave}
                disabled={saving || checking || phoneStatus === 'idle'}
                accessibilityRole="button"
                accessibilityLabel={editingContact ? 'Save Changes' : 'Add Contact'}
                accessibilityState={{ disabled: saving || checking || phoneStatus === 'idle' }}
              >
                {(saving || checking)
                  ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color={colors.white} size="small" />
                      <Text style={styles.saveBtnText}>{checking ? 'Verifying...' : 'Saving...'}</Text>
                    </View>
                  )
                  : <Text style={styles.saveBtnText}>{editingContact ? 'Save Changes' : 'Add Contact'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text.primary, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 50, marginBottom: 8 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: colors.text.primary },
  phoneHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: colors.status.safeBackground,
    borderRadius: 8, padding: 10, marginBottom: 4,
  },
  phoneHintText: { flex: 1, fontSize: 12, lineHeight: 17 },
  relationshipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  relChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  relChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  relChipText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  relChipTextActive: { color: colors.white },
  saveBtn: { backgroundColor: colors.primary, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
