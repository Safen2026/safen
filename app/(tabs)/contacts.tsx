import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, Alert, Modal, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';
import { sendContactRequest, notifyContactAdded } from '../../src/lib/notifications';
import { contactEvents } from '../../src/lib/events';
import { ContactDetailsModal, Contact } from '../../src/components/ContactDetailsModal';

const MAX_CONTACTS = 5;


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

const isValidPhone = (raw: string): boolean => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits.length === 13;
  if (digits.startsWith('0')) return digits.length === 11;
  return digits.length === 10;
};

export default function ContactsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Read the ?openAdd=true param passed from the home screen Add button
  const { openAdd } = useLocalSearchParams<{ openAdd?: string }>();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [protectingContacts, setProtectingContacts] = useState<Contact[]>([]);
  const [activeTab, setActiveTab] = useState<'my_contacts' | 'protecting'>('my_contacts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasRechecked = useRef(false);
  const [checking, setChecking] = useState(false); // checking if phone is on app
  const [deleting, setDeleting] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'on_app' | 'not_on_app'>('idle');

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
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

    const [myContactsRes, protectingRes] = await Promise.all([
      supabase
        .from('emergency_contacts')
        .select(`
          id, name, phone, relationship, is_on_app, contact_user_id, status,
          profiles:contact_user_id(avatar_url)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('emergency_contacts')
        .select(`
          id, name, phone, relationship, is_on_app, contact_user_id, status, user_id,
          profiles:user_id(full_name, phone, avatar_url)
        `)
        .eq('contact_user_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: true })
    ]);

    if (!myContactsRes.error && myContactsRes.data) {
      const mappedContacts = myContactsRes.data.map((c: any) => ({
        ...c,
        avatar_url: c.profiles?.avatar_url || null
      }));
      setContacts(mappedContacts);
    }

    if (!protectingRes.error && protectingRes.data) {
      const mappedProtecting = protectingRes.data.map((c: any) => ({
        id: c.id,
        name: c.profiles?.full_name || 'A Safen user',
        phone: c.profiles?.phone || c.phone,
        relationship: 'You are protecting',
        is_on_app: true,
        contact_user_id: c.user_id, // Map the protector's user_id so we can ping them
        status: c.status,
        avatar_url: c.profiles?.avatar_url || null,
        is_protector: true, // Internal flag to identify this is a protecting contact
      }));
      setProtectingContacts(mappedProtecting);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Refetch every time this tab comes into focus (catches accept/decline from other phone)
  useFocusEffect(
    useCallback(() => {
      fetchContacts();

      // If navigated here with ?openAdd=true, open the add-contact sheet immediately
      if (openAdd === 'true') {
        setForm(EMPTY_FORM);
        setEditingContact(null);
        setSheetVisible(true);
        // Clear the param so back-navigation doesn't re-open the sheet
        router.setParams({ openAdd: undefined });
      }
    }, [fetchContacts, openAdd, router])
  );

  // Instant refresh: fires the moment the sender's phone receives the accepted/declined notification
  useEffect(() => {
    return contactEvents.onRefresh(() => fetchContacts());
  }, [fetchContacts]);


  // Realtime: auto-refresh when any row involving this user changes on either side.
  // Two listeners are needed because Supabase row-level filters are column-specific:
  //   - user_id listener    → catches changes to our own contacts
  //   - contact_user_id listener → catches when someone else adds/removes/accepts us
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel(`emergency_contacts:${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'emergency_contacts',
          filter: `user_id=eq.${user.id}`,
        }, () => fetchContacts())
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'emergency_contacts',
          filter: `contact_user_id=eq.${user.id}`,
        }, () => fetchContacts())
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchContacts]);


  // Re-check unverified contacts once after initial load.
  // Uses a ref flag so it never triggers more than once per mount,
  // breaking the fetchContacts → contacts change → re-trigger loop.
  useEffect(() => {
    if (loading || hasRechecked.current) return;
    hasRechecked.current = true;

    const runRecheck = async () => {
      const unverified = contacts.filter(c => !c.is_on_app);
      if (unverified.length === 0) return;

      let anyUpdated = false;
      for (const contact of unverified) {
        const e164 = toE164Nigeria(contact.phone);
        const withoutPlus = e164.replace(/^\+/, '');
        const digits = contact.phone.replace(/\D/g, '');
        const formats = [...new Set([e164, withoutPlus, digits])];

        let foundId = null;
        for (const fmt of formats) {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', fmt)
            .maybeSingle();
          if (data) {
            foundId = data.id;
            break;
          }
        }

        if (foundId) {
          await supabase
            .from('emergency_contacts')
            .update({ is_on_app: true, contact_user_id: foundId })
            .eq('id', contact.id);
          anyUpdated = true;

          // This contact just turned out to be on Safen — let them know
          // they were added, same as if they'd been on the app already.
          const { data: { user: me } } = await supabase.auth.getUser();
          if (me) {
            const myName = me.user_metadata?.full_name || me.user_metadata?.first_name || 'A Safen user';
            notifyContactAdded(foundId, myName);
          }
        }
      }

      // Only re-fetch if something actually changed
      if (anyUpdated) fetchContacts();
    };

    runRecheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Check phone number as user types (debounced).
  // Returns the resolved status so handleSave can await it directly.
  const checkPhoneOnApp = useCallback(async (phone: string): Promise<'on_app' | 'not_on_app' | 'idle'> => {
    const digits = phone.replace(/\D/g, '');
    if (!isValidPhone(phone)) {
      setPhoneStatus('idle');
      return 'idle';
    }
    setChecking(true);

    const e164 = toE164Nigeria(phone);               // +2348125919742
    const withoutPlus = e164.replace(/^\+/, '');    // 2348125919742
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
    if (!sheetVisible) { setPhoneStatus('idle'); return; }
    const timer = setTimeout(() => checkPhoneOnApp(form.phone), 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSelectedContact(null);
    setEditingContact(contact);
    setForm({ name: contact.name, phone: contact.phone, relationship: contact.relationship ?? '' });
    setPhoneStatus(contact.is_on_app ? 'on_app' : 'not_on_app');
    setSheetVisible(true);
  };

  const validateForm = (): string | null => {
    if (!form.name.trim()) return 'Please enter a name.';
    if (!isValidPhone(form.phone)) return 'Please enter a valid 11-digit phone number.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) { Alert.alert('Missing Info', validationError); return; }

    // RACE CONDITION FIX: if the user tapped Save before the 600ms debounce
    // fired, phoneStatus is still 'idle'. Run the check immediately and await it.
    let resolvedStatus = phoneStatus;
    if (phoneStatus === 'idle') {
      resolvedStatus = await checkPhoneOnApp(form.phone);
    }

    // If not on app, confirm they still want to save
    if (resolvedStatus === 'not_on_app') {
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

    await persistContact(resolvedStatus === 'on_app', contactUserId);
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

    let newContactId: string | null = null;

    if (editingContact) {
      const { error } = await supabase
        .from('emergency_contacts')
        .update(payload)
        .eq('id', editingContact.id);

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    } else {
      // Check if a contact with this phone already exists and what their status is.
      // We only allow re-adding if they were previously declined; accepted/pending contacts
      // must not be silently overwritten.
      const { data: existing } = await supabase
        .from('emergency_contacts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('phone', payload.phone)
        .maybeSingle();

      if (existing) {
        setSaving(false);

        if (existing.status === 'accepted') {
          Alert.alert(
            'Already Added',
            `${form.name.trim()} is already in your safety network.`
          );
          return;
        }

        if (existing.status === 'pending') {
          Alert.alert(
            'Request Pending',
            `A request has already been sent to ${form.name.trim()}. They haven\'t responded yet.`
          );
          return;
        }

        // Status is 'declined' — allow them to re-add
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
      // Wait to send contact request until after the success modal, so we can use a single block for edit and new
    }

    setSheetVisible(false);
    await fetchContacts();
    setSuccessModal({
      visible: true,
      title: editingContact ? 'Contact Updated' : (isOnApp ? 'Request Sent' : 'Contact Added'),
      message: editingContact
        ? 'Your changes have been saved.'
        : (isOnApp
            ? `A contact request has been sent to ${form.name}. They will be added to your contacts once they accept.`
            : `${form.name} has been saved. They'll be auto-verified once they join Safen.`),
    });

    // Let the added person know by sending a contact request, but only the first time this link is
    // made — not on every edit of an already-linked contact.
    if (isOnApp && contactUserId && contactUserId !== editingContact?.contact_user_id) {
      const myName = user.user_metadata?.full_name || user.user_metadata?.first_name || 'A Safen user';
      
      // Determine the contact ID to use
      const contactIdToUse = editingContact?.id || newContactId;
      
      if (contactIdToUse) {
        sendContactRequest(contactUserId, myName, contactIdToUse);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.contact) return;
    const contact = deleteModal.contact;
    setDeleting(contact.id);
    setDeleteModal({ visible: false, contact: null });

    // 1. Delete the row on our side
    await supabase.from('emergency_contacts').delete().eq('id', contact.id);

    // 2. If this was a linked (on-app) contact, also delete the mirror row
    //    on their side so they stop seeing "You are protecting" this person.
    if (contact.contact_user_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('emergency_contacts')
          .delete()
          .eq('user_id', contact.contact_user_id)
          .eq('contact_user_id', user.id);
      }
    }

    setDeleting(null);
    await fetchContacts();

    // Broadcast to the home screen SafetyNetworkRow so it re-fetches immediately.
    // Supabase realtime DELETE filters require REPLICA IDENTITY FULL to work reliably;
    // the event bus is a guaranteed, zero-latency alternative.
    contactEvents.emitRefresh();
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
      <TouchableOpacity 
        style={styles.contactCard}
        activeOpacity={0.7}
        onPress={() => setSelectedContact(item)}
      >
        <View style={{ marginRight: 12, position: 'relative' }}>
          <View style={[styles.avatar, { marginRight: 0 }, !item.avatar_url && { backgroundColor: getAvatarColor(item.name) }]}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            )}
          </View>
          {/* Online indicator dot */}
          <View style={[
            styles.onlineDot,
            { backgroundColor: item.is_on_app ? colors.status.safeText : '#9CA3AF' }
          ]} />
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.contactName}>{item.name}</Text>
          </View>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {item.relationship && (
              <View style={styles.relationshipBadge}>
                <Text style={styles.relationshipText}>{item.relationship}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>View Details</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </View>
          </View>
        </View>

        <View style={styles.contactActions}>
          {!item.is_protector && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEditSheet(item)} disabled={isBeingDeleted}>
              <Ionicons name="pencil-outline" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
          {!item.is_protector && (
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
          )}
        </View>
      </TouchableOpacity>
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
          <Text style={styles.headerSubtitle}>
            {activeTab === 'my_contacts' 
              ? `${contacts.length}/${MAX_CONTACTS} contacts added` 
              : `${protectingContacts.length} people added you`}
          </Text>
        </View>
        {activeTab === 'my_contacts' && contacts.length < MAX_CONTACTS && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddSheet}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'my_contacts' && styles.segmentTabActive]}
          onPress={() => setActiveTab('my_contacts')}
        >
          <Text style={[styles.segmentText, activeTab === 'my_contacts' && styles.segmentTextActive]}>My Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.segmentTab, activeTab === 'protecting' && styles.segmentTabActive]}
          onPress={() => setActiveTab('protecting')}
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
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : activeTab === 'protecting' ? (
        <ScrollView
          contentContainerStyle={protectingContacts.length === 0 ? styles.emptyListContent : styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <FlatList
            data={protectingContacts}
            keyExtractor={item => item.id}
            renderItem={renderContact}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="shield-account-outline" size={48} color={colors.text.secondary} />
                </View>
                <Text style={styles.emptyTitle}>Nobody yet</Text>
                <Text style={styles.emptySubtitle}>When someone adds you as their emergency contact, they will appear here so you can check in on them.</Text>
              </View>
            }
            scrollEnabled={false}
          />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={
            contacts.filter(c => c.status === 'accepted' || !c.status).length === 0 &&
            contacts.filter(c => c.status === 'pending' || c.status === 'declined').length === 0
              ? styles.emptyListContent
              : styles.listContent
          }
          showsVerticalScrollIndicator={false}
        >

          {/* Active / accepted contacts */}
          <FlatList
            data={contacts.filter(c => c.status === 'accepted' || !c.status)}
            keyExtractor={item => item.id}
            renderItem={renderContact}
            ListEmptyComponent={
              contacts.filter(c => c.status === 'pending' || c.status === 'declined').length === 0
                ? renderEmpty
                : null
            }
            scrollEnabled={false}
          />

          {/* Sent requests section (pending + declined) */}
          {contacts.filter(c => c.status === 'pending' || c.status === 'declined').length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 12, paddingHorizontal: 4 }}>Sent Requests</Text>
              <FlatList
                data={contacts.filter(c => c.status === 'pending' || c.status === 'declined')}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                  const isDeclined = item.status === 'declined';
                  return (
                    <View style={[styles.contactCard, { opacity: isDeclined ? 0.75 : 0.6 }]}>
                      <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
                        <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <View style={styles.nameRow}>
                          <Text style={styles.contactName}>{item.name}</Text>
                        </View>
                        <Text style={styles.contactPhone}>{item.phone}</Text>
                        {isDeclined ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                            <Ionicons name="close-circle" size={13} color="#EF4444" />
                            <Text style={{ fontSize: 12, color: '#EF4444' }}>Request Declined</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                            <Ionicons name="time-outline" size={13} color="#B45309" />
                            <Text style={{ fontSize: 12, color: '#B45309' }}>Pending...</Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => setDeleteModal({ visible: true, contact: item })}
                        disabled={deleting === item.id}
                      >
                        {deleting === item.id
                          ? <ActivityIndicator size="small" color="#EF4444" />
                          : <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        }
                      </TouchableOpacity>
                    </View>
                  );
                }}
                scrollEnabled={false}
              />
            </View>
          )}

        </ScrollView>
      )}

      {/* Add / Edit bottom sheet */}
      <Modal visible={sheetVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSheetVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={[styles.sheetOverlay, { paddingTop: insets.top + 20 }]} onPress={() => setSheetVisible(false)}>
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
                    >
                      <Text style={[styles.relChipText, form.relationship === rel && styles.relChipTextActive]}>
                        {rel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, (saving || checking || phoneStatus === 'idle') && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving || checking || phoneStatus === 'idle'}
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

      {/* Delete confirmation */}
      <Modal visible={deleteModal.visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDeleteModal({ visible: false, contact: null })}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="trash-outline" size={32} color="#EF4444" />
            </View>
            <Text style={styles.deleteTitle}>{deleteModal.contact?.status === 'pending' ? 'Delete Pending Request' : 'Remove Contact'}</Text>
            <Text style={styles.deleteMessage}>
              {deleteModal.contact?.status === 'pending' 
                ? <Text>Are you sure you want to delete this pending request to <Text style={{ fontWeight: '700' }}>{deleteModal.contact?.name}</Text>?</Text>
                : <Text>Remove <Text style={{ fontWeight: '700' }}>{deleteModal.contact?.name}</Text> from your emergency contacts?</Text>}
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setDeleteModal({ visible: false, contact: null })}>
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteConfirmBtn} onPress={handleDeleteConfirm}>
                <Text style={styles.deleteConfirmText}>{deleteModal.contact?.status === 'pending' ? 'Delete Request' : 'Remove'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ContactDetailsModal 
        visible={!!selectedContact}
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onEdit={() => {
          if (selectedContact) openEditSheet(selectedContact);
        }}
        onDelete={() => {
          if (selectedContact) setDeleteModal({ visible: true, contact: selectedContact });
        }}
      />

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

  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
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