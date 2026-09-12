import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { notifyContactAdded } from '../lib/notifications';
import { toE164Nigeria } from '../utils/contactUtils';
import { Contact } from '../components/ContactDetailsModal';
import { contactEvents } from '../lib/events';
import { getUserDisplayName } from '../utils/userUtils';

const getContactsCacheKey = (userId: string) => `safen_cached_contacts_${userId}`;
const getProtectingCacheKey = (userId: string) => `safen_cached_protecting_${userId}`;

/** Shape stored in AsyncStorage for offline SMS fallback. */
export type CachedContact = { name: string; phone: string; status: string };

/** Lightweight shape stored for the protecting contacts cache. */
type CachedProtectingContact = { id: string; name: string; phone: string; avatar_url: string | null };

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [protectingContacts, setProtectingContacts] = useState<Contact[]>([]);
  // Start as `true` only if we have no cached data yet. Hydrated to `false`
  // immediately after the cache read, so the spinner is never shown when
  // the user has previously loaded their contacts.
  const [loading, setLoading] = useState(true);
  const hasHydrated = useRef(false);
  // Track which contact IDs have already been rechecked so new unverified
  // contacts that arrive later (via realtime) are still processed.
  const recheckedIdsRef = useRef<Set<string>>(new Set());

  // ── Stale-while-revalidate: hydrate BOTH lists from cache on mount ────────
  // Runs once synchronously before any network call so both tabs appear
  // instantly. The network fetch that follows updates data silently.
  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;

    let isMounted = true;

    const hydrate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (!session?.user) { setLoading(false); return; }

        const uid = session.user.id;
        const [rawContacts, rawProtecting] = await Promise.all([
          AsyncStorage.getItem(getContactsCacheKey(uid)),
          AsyncStorage.getItem(getProtectingCacheKey(uid)),
        ]);
        if (!isMounted) return;

        if (rawContacts) {
          const cached: CachedContact[] = JSON.parse(rawContacts);
          setContacts(cached.map((c, i) => ({
            id: `cached_${i}`,
            name: c.name,
            phone: c.phone,
            status: c.status,
            relationship: null,
            // Mark true so the recheck effect skips these placeholder rows;
            // the network fetch will correct the real value within seconds.
            is_on_app: true,
            contact_user_id: null,
          } as unknown as Contact)));
        }

        if (rawProtecting) {
          const cached: CachedProtectingContact[] = JSON.parse(rawProtecting);
          setProtectingContacts(cached.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            relationship: 'You are protecting',
            is_on_app: true,
            contact_user_id: null,
            status: 'accepted',
            avatar_url: c.avatar_url || undefined,
            is_protector: true,
          } as unknown as Contact)));
        }
      } catch (err) {
        console.warn('[useContacts] Cache hydration failed:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    hydrate();
    return () => { isMounted = false; };
  }, []);

  const fetchContacts = useCallback(async () => {
    // Do NOT setLoading(true) here: if we already have cached data showing,
    // the refresh happens silently in the background without blanking the UI.
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

    interface RawMyContact {
      id: string; name: string; phone: string; relationship: string | null;
      is_on_app: boolean; contact_user_id: string | null; status: string;
      profiles: { avatar_url: string | null } | null;
    }

    if (!myContactsRes.error && myContactsRes.data) {
      const mappedContacts = (myContactsRes.data as unknown as RawMyContact[]).map(c => ({
        ...c,
        avatar_url: c.profiles?.avatar_url || undefined
      }));
      setContacts(mappedContacts);
      // Persist fresh data back to cache for next app open
      const snapshot: CachedContact[] = mappedContacts.map(c => ({
        name: c.name,
        phone: c.phone,
        status: c.status,
      }));
      AsyncStorage.setItem(getContactsCacheKey(user.id), JSON.stringify(snapshot)).catch((err) => {
        console.warn('[useContacts] Failed to update contacts cache:', err);
      });
    }
    // Note: we no longer fall back to cache here — the hydration effect already
    // did that at mount time. A network error mid-session just leaves the
    // existing (stale) data in place, which is the correct behaviour.

    interface RawProtectingContact {
      id: string; phone: string; status: string; user_id: string;
      profiles: { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
    }

    if (!protectingRes.error && protectingRes.data) {
      const mappedProtecting = (protectingRes.data as unknown as RawProtectingContact[]).map(c => ({
        id: c.id,
        name: c.profiles?.full_name || 'A Safen user',
        phone: c.profiles?.phone || c.phone,
        relationship: 'You are protecting',
        is_on_app: true,
        contact_user_id: c.user_id,
        status: c.status,
        avatar_url: c.profiles?.avatar_url || undefined,
        is_protector: true,
      }));
      setProtectingContacts(mappedProtecting);
      // Cache the protecting list so it appears instantly on next app open
      const protectingSnapshot: CachedProtectingContact[] = mappedProtecting.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        avatar_url: c.avatar_url ?? null,
      }));
      AsyncStorage.setItem(getProtectingCacheKey(user.id), JSON.stringify(protectingSnapshot)).catch(err => {
        console.warn('[useContacts] Failed to update protecting cache:', err);
      });
    }

    setLoading(false);
  }, []);

  // Realtime: auto-refresh when any row involving this user changes on either side.
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

  // Instant refresh: fires the moment the sender's phone receives the accepted/declined notification
  useEffect(() => {
    return contactEvents.onRefresh(() => fetchContacts());
  }, [fetchContacts]);

  // Re-check unverified contacts that haven't been looked up yet.
  // Runs whenever the contacts list changes so new additions are caught
  // even after the initial load (unlike the previous once-only flag).
  useEffect(() => {
    if (loading) return;
    const unverified = contacts.filter(
      c => !c.is_on_app && !recheckedIdsRef.current.has(c.id)
    );
    if (unverified.length === 0) return;

    // Mark all as about-to-be-checked before any async work so concurrent
    // renders can't trigger duplicate lookups for the same contact.
    unverified.forEach(c => recheckedIdsRef.current.add(c.id));

    const runRecheck = async () => {
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

          const { data: { user: me } } = await supabase.auth.getUser();
          if (me) {
            const myName = getUserDisplayName(me);
            notifyContactAdded(foundId, myName);
          }
        }
      }

      if (anyUpdated) fetchContacts();
    };

    runRecheck();
  // contacts is intentionally the dep — run whenever the list changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, loading]);


  return useMemo(() => ({
    contacts,
    protectingContacts,
    loading,
    fetchContacts
  }), [contacts, protectingContacts, loading, fetchContacts]);
}
