import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, Alert, Modal, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';

const MAX_CONTACTS = 5;

type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  is_on_app: boolean;
  contact_user_id: string | null;
};

type FormData = {
  name: string;
  phone: string;
  relationship: string;
};

const EMPTY_FORM: FormData = { name: '', phone: '', relationship: '' };
const RELATIONSHIPS = ['Parent', 'Sibling', 'Spouse', 'Friend', 'Colleague', 'Other'];

// Normalize to E.164 for Nigerian numbers so we match what's in profiles
const toE164Nigeria = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
};

export default function ContactsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false); // checking if phone is on app
  const [deleting, setDeleting] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'on_app' | 'not_on_app'>('idle');

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; contact: Contact | null }>({
    visible: false, contact: null,
  });
  const [successModal, setSuccessModal] = useState({ visible: false, title: '', message: '' });

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('id, name, phone, relationship, is_on_app, contact_user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (!error && data) setContacts(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Re-check unverified contacts on screen load — auto-upgrades any that joined since last check
  const recheckUnverified = useCallback(async () => {
    const unverified = contacts.filter(c => !c.is_on_app);
    if (unverified.length === 0) return;

    for (const contact of unverified) {
      const normalized = toE164Nigeria(contact.phone);
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalized)
        .maybeSingle();

      if (data) {
        await supabase
          .from('emergency_contacts')
          .update({ is_on_app: true, contact_user_id: data.id })
          .eq('id', contact.id);
      }
    }

    // Refresh list if any were updated
    const hadUnverified = unverified.length > 0;
    if (hadUnverified) fetchContacts();
  }, [contacts]);

  useEffect(() => {
    if (!loading) recheckUnverified();
  }, [loading]);

  // Check phone number as user types (debounced)
  const checkPhoneOnApp = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneStatus('idle');
      return;
    }
    setChecking(true);
    const normalized = toE164Nigeria(phone);
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', normalized)
      .maybeSingle();

    setPhoneStatus(data ? 'on_app' : 'not_on_app');
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!sheetVisible) { setPhoneStatus('idle'); return; }
    const timer = setTimeout(() => checkPhoneOnApp(form.phone), 600);
    return () => clearTimeout(timer);
  }, [form.phone, sheetVisible]);

  const openAddSheet = () => {
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert('Limit Reached', `You can only add up to ${MAX_CONTACTS} emergency contacts.`);
      return;
    }
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setPhoneStatus('idle');
    setSheetVisible(true);
  };

  const openEditSheet = (contact: Contact) => {
    setEditingContact(contact);
    setForm({ name: contact.name, phone: contact.phone, relationship: contact.relationship ?? '' });
    setPhoneStatus(contact.is_on_app ? 'on_app' : 'not_on_app');
    setSheetVisible(true);
  };

  const validateForm = (): string | null => {
    if (!form.name.trim()) return 'Please enter a name.';
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) return 'Please enter a valid phone number.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) { Alert.alert('Missing Info', validationError); return; }

    // If not on app, confirm they still want to save
    if (phoneStatus === 'not_on_app') {
      Alert.alert(
        'Not on Safen',
        `This number isn't registered on Safen yet. You can still save them — they'll be automatically verified once they join the app. Save anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', onPress: () => persistContact(false, null) },
        ]
      );
      return;
    }

    // If on app, get their user ID to link
    let contactUserId: string | null = null;
    if (phoneStatus === 'on_app') {
      const normalized = toE164Nigeria(form.phone);
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalized)
        .maybeSingle();
      contactUserId = data?.id ?? null;
    }

    await persistContact(phoneStatus === 'on_app', contactUserId);
  };

  const persistContact = async (isOnApp: boolean, contactUserId: string | null) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      relationship: form.relationship.trim() || null,
      is_on_app: isOnApp,
      contact_user_id: contactUserId,
    };

    if (editingContact) {
      const { error } = await supabase
        .from('emergency_contacts')
        .update(payload)
        .eq('id', editingContact.id);

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    } else {
      const { error } = await supabase
        .from('emergency_contacts')
        .insert({ ...payload, user_id: user.id });

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    }

    setSheetVisible(false);
    await fetchContacts();
    setSuccessModal({
      visible: true,
      title: editingContact ? 'Contact Updated' : 'Contact Added',
      message: isOnApp
        ? `${form.name} is on Safen and will receive in-app alerts when you trigger SOS.`
        : `${form.name} has been saved. They'll be auto-verified once they join Safen.`,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.contact) return;
    const id = deleteModal.contact.id;
    setDeleting(id);
    setDeleteModal({ visible: false, contact: null });
    await supabase.from('emergency_contacts').delete().eq('id', id);
    setDeleting(null);
    await fetchContacts();
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const getAvatarColor = (name: string) => {
    const palette = ['#0A2463', '#1B5E20', '#DC2626', '#EA580C', '#7C3AED'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const isBeingDeleted = deleting === item.id;

    return (
      <View style={styles.contactCard}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
          {/* Online indicator dot */}
          <View style={[
            styles.onlineDot,
            { backgroundColor: item.is_on_app ? colors.status.safeText : '#9CA3AF' }
          ]} />
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.contactName}>{item.name}</Text>
            {item.is_on_app ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={11} color={colors.status.safeText} />
                <Text style={styles.verifiedText}>On Safen</Text>
              </View>
            ) : (
              <View style={styles.unverifiedBadge}>
                <Ionicons name="alert-circle-outline" size={11} color="#B45309" />
                <Text style={styles.unverifiedText}>Not on app</Text>
              </View>
            )}
          </View>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          {item.relationship && (
            <View style={styles.relationshipBadge}>
              <Text style={styles.relationshipText}>{item.relationship}</Text>
            </View>
          )}
        </View>

        <View style={styles.contactActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEditSheet(item)} disabled={isBeingDeleted}>
            <Ionicons name="pencil-outline" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => setDeleteModal({ visible: true, contact: item })}
            disabled={isBeingDeleted}
          >
            {isBeingDeleted
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <Ionicons name="trash-outline" size={18} color="#EF4444" />
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="account-group-outline" size={48} color={colors.text.secondary} />
      </View>
      <Text style={styles.emptyTitle}>No emergency contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Add up to {MAX_CONTACTS} people. Contacts on Safen will receive instant in-app alerts when you trigger SOS.
      </Text>
      <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddSheet}>
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.emptyAddText}>Add Your First Contact</Text>
      </TouchableOpacity>
    </View>
  );

  const phoneStatusColor = phoneStatus === 'on_app'
    ? colors.status.safeText
    : phoneStatus === 'not_on_app' ? '#B45309' : colors.border;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Emergency Contacts</Text>
          <Text style={styles.headerSubtitle}>{contacts.length}/{MAX_CONTACTS} contacts added</Text>
        </View>
        {contacts.length > 0 && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddSheet}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {/* Legend */}
      {contacts.length > 0 && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.status.safeText }]} />
            <Text style={styles.legendText}>On Safen — receives in-app alerts</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
            <Text style={styles.legendText}>Not on app yet</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          renderItem={renderContact}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={contacts.length === 0 ? styles.emptyListContent : styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add / Edit bottom sheet */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.sheetOverlay} onPress={() => setSheetVisible(false)}>
            <Pressable
              style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
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
                />
              </View>

              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <View style={[styles.inputRow, { borderColor: phoneStatusColor }]}>
                <Ionicons name="call-outline" size={18} color={colors.text.secondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 08012345678"
                  placeholderTextColor={colors.text.secondary}
                  value={form.phone}
                  onChangeText={t => setForm(f => ({ ...f, phone: t }))}
                  keyboardType="phone-pad"
                />
                {/* Live status indicator */}
                {checking && <ActivityIndicator size="small" color={colors.text.secondary} />}
                {!checking && phoneStatus === 'on_app' && (
                  <Ionicons name="shield-checkmark" size={20} color={colors.status.safeText} />
                )}
                {!checking && phoneStatus === 'not_on_app' && (
                  <Ionicons name="alert-circle-outline" size={20} color="#B45309" />
                )}
              </View>

              {/* Phone status hint */}
              {phoneStatus === 'on_app' && (
                <View style={styles.phoneHint}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.status.safeText} />
                  <Text style={[styles.phoneHintText, { color: colors.status.safeText }]}>
                    This person is on Safen — they'll receive in-app alerts.
                  </Text>
                </View>
              )}
              {phoneStatus === 'not_on_app' && (
                <View style={[styles.phoneHint, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
                  <Text style={[styles.phoneHintText, { color: '#B45309' }]}>
                    Not on Safen yet. You can still save — they'll be auto-verified when they join.
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
                  >
                    <Text style={[styles.relChipText, form.relationship === rel && styles.relChipTextActive]}>
                      {rel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (saving || checking) && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving || checking}
              >
                {saving
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.saveBtnText}>{editingContact ? 'Save Changes' : 'Add Contact'}</Text>
                }
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete confirmation */}
      <Modal visible={deleteModal.visible} transparent animationType="fade" onRequestClose={() => setDeleteModal({ visible: false, contact: null })}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="trash-outline" size={32} color="#EF4444" />
            </View>
            <Text style={styles.deleteTitle}>Remove Contact</Text>
            <Text style={styles.deleteMessage}>
              Remove <Text style={{ fontWeight: '700' }}>{deleteModal.contact?.name}</Text> from your emergency contacts?
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setDeleteModal({ visible: false, contact: null })}>
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmBtn} onPress={handleDeleteConfirm}>
                <Text style={styles.deleteConfirmText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={successModal.visible}
        title={successModal.title}
        message={successModal.message}
        iconName="checkmark-circle"
        iconColor={colors.status.safeText}
        onClose={() => setSuccessModal(s => ({ ...s, visible: false }))}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text.primary },
  headerSubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },

  legendRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.text.secondary },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: colors.text.secondary },

  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  emptyListContent: { flex: 1 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: colors.white,
  },
  contactInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  contactName: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.status.safeBackground,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontSize: 10, fontWeight: '700', color: colors.status.safeText },
  unverifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  unverifiedText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  contactPhone: { fontSize: 14, color: colors.text.secondary, marginBottom: 4 },
  relationshipBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  relationshipText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  contactActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  deleteBtn: { borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  emptyAddText: { color: colors.white, fontSize: 16, fontWeight: '700' },

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

  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  deleteCard: { backgroundColor: colors.white, borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' },
  deleteIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  deleteTitle: { fontSize: 20, fontWeight: '800', color: colors.text.primary, marginBottom: 8 },
  deleteMessage: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  deleteActions: { flexDirection: 'row', gap: 12, width: '100%' },
  deleteCancelBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  deleteCancelText: { fontSize: 15, fontWeight: '700', color: colors.text.secondary },
  deleteConfirmBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444' },
  deleteConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});