import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifyContactAdded } from '../lib/notifications';
import { toE164Nigeria } from '../utils/contactUtils';
import { Contact } from '../components/ContactDetailsModal';
import { contactEvents } from '../lib/events';

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [protectingContacts, setProtectingContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const hasRechecked = useRef(false);

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
    }

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
        contact_user_id: c.user_id, // Map the protector's user_id so we can ping them
        status: c.status,
        avatar_url: c.profiles?.avatar_url || undefined,
        is_protector: true, // Internal flag to identify this is a protecting contact
      }));
      setProtectingContacts(mappedProtecting);
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

  // Re-check unverified contacts once after initial load.
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

          const { data: { user: me } } = await supabase.auth.getUser();
          if (me) {
            const myName = me.user_metadata?.full_name || me.user_metadata?.first_name || 'A Safen user';
            notifyContactAdded(foundId, myName);
          }
        }
      }

      if (anyUpdated) fetchContacts();
    };

    runRecheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return { contacts, protectingContacts, loading, fetchContacts };
}
