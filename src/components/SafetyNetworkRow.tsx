import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { contactEvents } from '../lib/events';
import { Shadows } from '../constants/Theme';
import { Avatar } from './Avatar';

type Contact = {
  id: string;
  name: string;
  is_on_app: boolean;
  avatar_url: string | null;
  status?: string;
};

type CachedContact = { name: string; phone: string; status: string };

// Must stay in sync with the key written by useContacts.ts
const getContactsCacheKey = (userId: string) => `safen_cached_contacts_${userId}`;

const MAX_VISIBLE = 5;

export const SafetyNetworkRow = React.memo(() => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const isMountedRef = useRef(true);
  // Holds the channel cleanup so the async init can register it for teardown.
  const channelCleanupRef = useRef<(() => void) | null>(null);

  // ── Silent network refresh ────────────────────────────────────────────────
  // Does NOT blank the UI — contacts already shown from cache stay visible
  // while this runs in the background.
  const fetchFromNetwork = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !isMountedRef.current) return;

    const { data, error } = await supabase
      .from('emergency_contacts')
      .select(`
        id,
        name,
        is_on_app,
        status,
        contact_user_id,
        profiles:contact_user_id (avatar_url)
      `)
      .eq('user_id', user.id)
      .eq('status', 'accepted')   // Strictly show accepted contacts only on the home card
      .order('created_at', { ascending: true })
      .limit(MAX_VISIBLE);

    if (!error && data && isMountedRef.current) {
      interface RawContactRow {
        id: string;
        name: string;
        is_on_app: boolean;
        status: string;
        contact_user_id: string | null;
        profiles: { avatar_url: string | null } | null;
      }
      setContacts(
        (data as unknown as RawContactRow[]).map(c => ({
          id        : c.id,
          name      : c.name,
          is_on_app : c.is_on_app ?? false,
          avatar_url: c.profiles?.avatar_url ?? null,
          status    : c.status,
        }))
      );
    }
  }, []);

  // ── Mount: cache hydration → network refresh → realtime subscription ──────
  useEffect(() => {
    isMountedRef.current = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !isMountedRef.current) return;

        // Step 1: Read from cache immediately so names appear before any network call.
        const raw = await AsyncStorage.getItem(getContactsCacheKey(session.user.id));
        if (raw && isMountedRef.current) {
          const parsed = JSON.parse(raw);
          const cachedList: CachedContact[] = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.contacts) ? parsed.contacts : []);

          if (cachedList.length > 0) {
            setContacts(
              cachedList
                .filter(c => c.status === 'accepted')
                .slice(0, MAX_VISIBLE)
                .map((c, i) => ({
                  id        : `cached_${i}`,
                  name      : c.name,
                  is_on_app : true,
                  avatar_url: null,
                  status    : c.status,
                }))
            );
          }
        }

        // Step 2: Silently refresh to get real IDs, avatars, and is_on_app values.
        await fetchFromNetwork();

        // Step 3: Subscribe to realtime changes for live updates.
        if (!isMountedRef.current) return;
        const channel = supabase
          .channel(`safety_network_row:${session.user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'emergency_contacts',
            filter: `user_id=eq.${session.user.id}`,
          }, () => fetchFromNetwork())
          .subscribe();

        channelCleanupRef.current = () => supabase.removeChannel(channel);
      } catch (err) {
        console.warn('[SafetyNetworkRow] init error:', err);
      }
    };

    init();

    return () => {
      isMountedRef.current = false;
      channelCleanupRef.current?.();
      channelCleanupRef.current = null;
    };
  }, [fetchFromNetwork]);

  // ── Event bus: refresh when contacts are added/edited/deleted ────────────
  useEffect(() => {
    const unsubscribe = contactEvents.onRefresh(fetchFromNetwork);
    return () => unsubscribe();
  }, [fetchFromNetwork]);

  const goToNetwork = useCallback(() => router.push('/(tabs)/contacts'), [router]);
  const goToAddForm = useCallback(
    () => router.push({ pathname: '/(tabs)/contacts', params: { openAdd: 'true' } }),
    [router]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header} accessible={true} accessibilityRole="header">
        <Text style={[styles.title, { color: colors.text.primary }]}>My Safety Network</Text>
        <TouchableOpacity onPress={goToNetwork} accessibilityRole="button" accessibilityLabel="Manage safety network">
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
          <TouchableOpacity
            key={contact.id}
            style={styles.item}
            onPress={goToNetwork}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Contact: ${contact.name}. Tap to view network.`}
          >
            <View style={{ marginBottom: 6 }}>
              <Avatar
                name={contact.name}
                avatarUrl={contact.avatar_url}
                isOnline={contact.is_on_app}
                size={52}
              />
            </View>
            <Text style={[styles.contactName, { color: colors.text.secondary }]} numberOfLines={1}>
              {contact.name.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Add button */}
        <TouchableOpacity
          style={styles.item}
          onPress={goToAddForm}
          accessibilityRole="button"
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
});

SafetyNetworkRow.displayName = 'SafetyNetworkRow';

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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