import React, { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { showToast } from '../../src/utils/toast';
import { sendContactRequest } from '../../src/lib/notifications';
import { contactEvents } from '../../src/lib/events';
import { ContactDetailsModal, Contact } from '../../src/components/ContactDetailsModal';
import { useContacts } from '../../src/hooks/useContacts';
import { isValidPhone } from '../../src/utils/contactUtils';
import { ContactCard } from '../../src/components/contacts/ContactCard';
import { ContactListEmptyState } from '../../src/components/contacts/ContactListEmptyState';
import { AddEditContactSheet, FormData, EMPTY_FORM } from '../../src/components/contacts/AddEditContactSheet';
import { DeleteContactModal } from '../../src/components/contacts/DeleteContactModal';

const MAX_CONTACTS = 5;

export default function ContactsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
  const { openAdd } = useLocalSearchParams<{ openAdd?: string }>();

  const { contacts, protectingContacts, loading, fetchContacts } = useContacts();

  const [activeTab, setActiveTab] = useState<'my_contacts' | 'protecting'>('my_contacts');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [initialForm, setInitialForm] = useState<FormData>(EMPTY_FORM);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; contact: Contact | null }>({
    visible: false, contact: null,
  });

  useFocusEffect(
    useCallback(() => {
      fetchContacts();
      if (openAdd === 'true') {
        setInitialForm(EMPTY_FORM);
        setEditingContact(null);
        setSheetVisible(true);
        router.setParams({ openAdd: undefined });
      }
    }, [fetchContacts, openAdd, router])
  );

  const openAddSheet = useCallback(() => {
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert('Limit Reached', `You can only add up to ${MAX_CONTACTS} emergency contacts.`);
      return;
    }
    setEditingContact(null);
    setInitialForm(EMPTY_FORM);
    setSheetVisible(true);
  }, [contacts.length]);

  const openEditSheet = useCallback((contact: Contact) => {
    setSelectedContact(null);
    setEditingContact(contact);
    setInitialForm({ name: contact.name, phone: contact.phone, relationship: contact.relationship ?? '' });
    setSheetVisible(true);
  }, []);

  const validateForm = useCallback((form: FormData): string | null => {
    if (!form.name.trim()) return 'Please enter a name.';
    if (!isValidPhone(form.phone)) return 'Please enter a valid 11-digit phone number.';
    return null;
  }, []);

  const handleNotOnAppConfirm = useCallback((form: FormData) => {
    Alert.alert(
      'Not on Safen',
      `This number isn't registered on Safen yet. You can still save them — they'll be automatically verified once they join the app. Save anyway?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save Anyway', onPress: () => persistContact(form, false, null) },
      ]
    );
  }, []);

  const persistContact = async (form: FormData, isOnApp: boolean, contactUserId: string | null) => {
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

    let newContactId: string | null = null;

    if (editingContact) {
      const { error } = await supabase
        .from('emergency_contacts')
        .update(payload)
        .eq('id', editingContact.id);

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    } else {
      const { data: existing } = await supabase
        .from('emergency_contacts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('phone', payload.phone)
        .maybeSingle();

      if (existing) {
        setSaving(false);

        if (existing.status === 'accepted') {
          Alert.alert('Already Added', `${form.name.trim()} is already in your safety network.`);
          return;
        }

        if (existing.status === 'pending') {
          Alert.alert('Request Pending', `A request has already been sent to ${form.name.trim()}. They haven't responded yet.`);
          return;
        }

        const { error } = await supabase
          .from('emergency_contacts')
          .update({ ...payload, status: 'pending' })
          .eq('id', existing.id);

        if (error) { Alert.alert('Error', error.message); return; }
        newContactId = existing.id;
      } else {
        const { data: newContact, error } = await supabase
          .from('emergency_contacts')
          .insert({ ...payload, user_id: user.id, status: 'pending' })
          .select()
          .single();

        setSaving(false);
        if (error) { Alert.alert('Error', error.message); return; }
        if (newContact) newContactId = newContact.id;
      }
    }

    setSheetVisible(false);
    await fetchContacts();
    
    showToast({
      title: editingContact ? 'Contact Updated' : (isOnApp ? 'Request Sent' : 'Contact Added'),
      subtitle: editingContact
        ? 'Your changes have been saved.'
        : (isOnApp
            ? `A contact request has been sent to ${form.name}. They will be added to your contacts once they accept.`
            : `${form.name} has been saved. They'll be auto-verified once they join Safen.`),
      icon: 'checkmark-circle',
    });

    if (isOnApp && contactUserId && contactUserId !== editingContact?.contact_user_id) {
      const myName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A Safen user';
      const contactIdToUse = editingContact?.id || newContactId;
      if (contactIdToUse) {
        sendContactRequest(contactUserId, myName, contactIdToUse);
      }
    }
  };

  const handleSaveContact = useCallback(async (form: FormData, resolvedStatus: 'on_app' | 'not_on_app', contactUserId: string | null) => {
    const errorMsg = validateForm(form);
    if (errorMsg) {
      Alert.alert('Missing Info', errorMsg);
      return;
    }
    await persistContact(form, resolvedStatus === 'on_app', contactUserId);
  }, [validateForm]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModal.contact) return;
    const contact = deleteModal.contact;
    setDeleting(contact.id);
    setDeleteModal({ visible: false, contact: null });

    await supabase.from('emergency_contacts').delete().eq('id', contact.id);


    setDeleting(null);
    await fetchContacts();
    contactEvents.emitRefresh();
  }, [deleteModal.contact, fetchContacts]);

  const activeContactsList = React.useMemo(() => contacts.filter(c => c.status === 'accepted' || !c.status), [contacts]);
  const pendingContactsList = React.useMemo(() => contacts.filter(c => c.status === 'pending' || c.status === 'declined'), [contacts]);

  const handleDeleteRequest = useCallback((contact: Contact) => {
    setDeleteModal({ visible: true, contact });
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteModal({ visible: false, contact: null });
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedContact(null);
  }, []);

  const handleEditRequest = useCallback(() => {
    if (selectedContact) openEditSheet(selectedContact);
  }, [selectedContact, openEditSheet]);

  const handleDeleteDetailsRequest = useCallback(() => {
    if (selectedContact) setDeleteModal({ visible: true, contact: selectedContact });
  }, [selectedContact]);

  const renderContactCard = useCallback(({ item }: { item: Contact }) => (
    <ContactCard
      item={item}
      colors={colors}
      deletingId={deleting}
      onPress={setSelectedContact}
      onDeleteRequest={handleDeleteRequest}
    />
  ), [colors, deleting, setSelectedContact, handleDeleteRequest]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle} accessibilityRole="header">Emergency Contacts</Text>
          <Text style={styles.headerSubtitle}>
            {activeTab === 'my_contacts' 
              ? `${contacts.length}/${MAX_CONTACTS} contacts added` 
              : `${protectingContacts.length} people added you`}
          </Text>
        </View>
        {activeTab === 'my_contacts' && contacts.length < MAX_CONTACTS && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddSheet} accessibilityRole="button" accessibilityLabel="Add Contact">
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'my_contacts' && styles.segmentTabActive]}
          onPress={() => setActiveTab('my_contacts')}
          accessibilityRole="button"
          accessibilityLabel="My Contacts Tab"
          accessibilityState={{ selected: activeTab === 'my_contacts' }}
        >
          <Text style={[styles.segmentText, activeTab === 'my_contacts' && styles.segmentTextActive]}>My Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'protecting' && styles.segmentTabActive]}
          onPress={() => setActiveTab('protecting')}
          accessibilityRole="button"
          accessibilityLabel="Protecting Tab"
          accessibilityState={{ selected: activeTab === 'protecting' }}
        >
          <Text style={[styles.segmentText, activeTab === 'protecting' && styles.segmentTextActive]}>Protecting</Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      {(activeTab === 'my_contacts' ? contacts : protectingContacts).length > 0 && (
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
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : activeTab === 'protecting' ? (
        <FlatList
          contentContainerStyle={protectingContacts.length === 0 ? styles.emptyListContent : styles.listContent}
          data={protectingContacts}
          keyExtractor={item => item.id}
          renderItem={renderContactCard}
          ListEmptyComponent={<ContactListEmptyState type="protecting" colors={colors} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          contentContainerStyle={
            activeContactsList.length === 0 && pendingContactsList.length === 0
              ? styles.emptyListContent
              : styles.listContent
          }
          data={activeContactsList}
          keyExtractor={item => item.id}
          renderItem={renderContactCard}
          ListEmptyComponent={
            pendingContactsList.length === 0
              ? <ContactListEmptyState type="my_contacts" colors={colors} maxContacts={MAX_CONTACTS} onAddContact={openAddSheet} />
              : null
          }
          ListFooterComponent={
            pendingContactsList.length > 0 ? (
              <View style={{ marginTop: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 12, paddingHorizontal: 4 }}>Sent Requests</Text>
                <FlatList
                  data={pendingContactsList}
                  keyExtractor={item => item.id}
                  renderItem={renderContactCard}
                  scrollEnabled={false}
                />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add / Edit bottom sheet */}
      <AddEditContactSheet
        visible={sheetVisible}
        editingContact={editingContact}
        initialForm={initialForm}
        colors={colors}
        saving={saving}
        onClose={handleCloseSheet}
        onSave={handleSaveContact}
        onNotOnAppConfirm={handleNotOnAppConfirm}
        validateForm={validateForm}
      />

      {/* Delete confirmation */}
      <DeleteContactModal
        visible={deleteModal.visible}
        contact={deleteModal.contact}
        colors={colors}
        onCancel={handleCancelDelete}
        onConfirm={handleDeleteConfirm}
      />

      <ContactDetailsModal 
        visible={!!selectedContact}
        contact={selectedContact}
        onClose={handleCloseDetails}
        onEdit={handleEditRequest}
        onDelete={handleDeleteDetailsRequest}
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

  segmentContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.border, borderRadius: 12, padding: 4 },
  segmentTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segmentTabActive: { backgroundColor: colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  segmentTextActive: { color: colors.text.primary },

  legendRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.text.secondary },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: colors.text.secondary },

  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  emptyListContent: { flex: 1 },
});