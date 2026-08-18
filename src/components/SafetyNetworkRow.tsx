import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { supabase } from '../lib/supabase';
import { contactEvents } from '../lib/events';
import { Shadows } from '../constants/Theme';

type Contact = {
  id: string;
  name: string;
  is_on_app: boolean;
  avatar_url: string | null;
};

const MAX_VISIBLE = 5;

/** Returns up to 2 uppercase initials from a full name. */
const getInitials = (name: string) =>
  name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const SafetyNetworkRow = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const router     = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const isMountedRef = useRef(true);

  const fetchContacts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('emergency_contacts')
      .select(`
        id,
        name,
        is_on_app,
        contact_user_id,
        profiles:contact_user_id (avatar_url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(MAX_VISIBLE);

    if (!error && data && isMountedRef.current) {
      interface RawContactRow {
        id: string;
        name: string;
        is_on_app: boolean;
        contact_user_id: string | null;
        profiles: { avatar_url: string | null } | null;
      }
      setContacts(
        (data as unknown as RawContactRow[]).map(c => ({
          id        : c.id,
          name      : c.name,
          is_on_app : c.is_on_app ?? false,
          avatar_url: c.profiles?.avatar_url ?? null,
        }))
      );
    }
  }, []);

  // Initial fetch + realtime subscription for INSERT/UPDATE events
  useEffect(() => {
    isMountedRef.current = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await fetchContacts();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`safety_network_row:${user.id}`)
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

    return () => {
      isMountedRef.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchContacts]);

  // Also re-fetch when the contacts tab emits a delete event via the event bus.
  // This is the reliable path since Supabase realtime DELETE filters require
  // REPLICA IDENTITY FULL to match filtered rows.
  useEffect(() => contactEvents.onRefresh(fetchContacts), [fetchContacts]);

  const goToNetwork  = () => router.push('/(tabs)/contacts');
  const goToAddForm  = () => router.push({ pathname: '/(tabs)/contacts', params: { openAdd: 'true' } });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>My Safety Network</Text>
        <TouchableOpacity onPress={goToNetwork} accessibilityLabel="Manage safety network">
          <Text style={[styles.manage, { color: colors.primary }]}>Manage</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal contact row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {contacts.map(contact => (
          <View key={contact.id} style={styles.item}>
            <View style={styles.avatarWrap}>
              {contact.avatar_url ? (
                <Image source={{ uri: contact.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.white }]}>
                  <Text style={[styles.initials, { color: colors.text.primary }]}>
                    {getInitials(contact.name)}
                  </Text>
                </View>
              )}
              {contact.is_on_app && (
                <View style={[styles.onlineDot, { borderColor: colors.background }]} />
              )}
            </View>
            <Text style={[styles.contactName, { color: colors.text.secondary }]} numberOfLines={1}>
              {contact.name.split(' ')[0]}
            </Text>
          </View>
        ))}

        {/* Add button */}
        <TouchableOpacity
          style={styles.item}
          onPress={goToAddForm}
          accessibilityLabel="Add emergency contact"
        >
          <View style={[styles.addCircle, { borderColor: colors.border }]}>
            <Ionicons name="add" size={22} color={colors.text.secondary} />
          </View>
          <Text style={[styles.contactName, { color: colors.text.secondary }]}>Add</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  manage: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 4,
  },
  item: {
    alignItems: 'center',
    width: 58,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  initials: {
    fontSize: 15,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2,
  },
  contactName: {
    fontSize: 11,
    textAlign: 'center',
  },
  addCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
});
