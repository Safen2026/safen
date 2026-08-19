import type { ComponentProps } from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../context/SessionContext';
import type { Ionicons } from '@expo/vector-icons';

export type HistoryItem = {
  id: string;
  source: 'alert' | 'report';
  type: string;
  title: string;
  description?: string;
  address?: string;
  status?: string;
  created_at: string;
  resolved_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  media_paths?: string[];
};

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export const TYPE_META: Record<string, { icon: IoniconsName; color: string; label: string; category: string }> = {
  sos: { icon: 'alert', color: '#E02B2B', label: 'Emergency SOS', category: 'SOS' },
  medical: { icon: 'medkit', color: '#10B981', label: 'Medical Assistance', category: 'Medical' },
  police: { icon: 'shield', color: '#2563EB', label: 'Security Request', category: 'Security' },
  fire: { icon: 'flame', color: '#EA580C', label: 'Fire Incident', category: 'Fire' },
  robbery: { icon: 'person', color: '#7C3AED', label: 'Theft / Robbery Report', category: 'Security' },
  accident: { icon: 'car', color: '#D97706', label: 'Accident Report', category: 'Other' },
  other: { icon: 'document-text', color: '#6B7280', label: 'Incident Report', category: 'Other' },
};

export const FILTERS = ['All', 'SOS', 'Security', 'Medical', 'Fire', 'Other'];

export function useHistory() {
  const session = useSession();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchHistory = useCallback(async () => {
    try {
      if (!session?.user) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('id, type, status, created_at, resolved_at, latitude, longitude, media_paths')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (alertsError) console.error('Error fetching alerts:', alertsError);

      // Fetch reports
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('id, category, description, address, status, created_at, latitude, longitude, media_paths')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      
      if (reportsError) console.error('Error fetching reports:', reportsError);

      const combined: HistoryItem[] = [];

      (alertsData || []).forEach(a => {
        combined.push({
          id: a.id,
          source: 'alert',
          type: a.type || 'sos',
          title: TYPE_META[a.type]?.label || 'Emergency Alert',
          status: a.status || 'Resolved',
          created_at: a.created_at,
          resolved_at: a.resolved_at ?? null,
          latitude: a.latitude ?? null,
          longitude: a.longitude ?? null,
          media_paths: a.media_paths || [],
        });
      });

      (reportsData || []).forEach(r => {
        combined.push({
          id: r.id,
          source: 'report',
          type: r.category || 'other',
          title: TYPE_META[r.category]?.label || 'Incident Report',
          description: r.description,
          address: r.address,
          status: r.status || 'Resolved',
          created_at: r.created_at,
          resolved_at: null,      // reports table has no resolved_at column
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
          media_paths: r.media_paths || [],
        });
      });

      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(combined);
    } catch (err) {
      console.warn('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, [fetchHistory]);

  // 1. Filter items
  const filteredItems = useMemo(() => {
    if (activeFilter === 'All') return items;
    return items.filter(item => {
      const meta = TYPE_META[item.type] || TYPE_META.other;
      return meta.category === activeFilter;
    });
  }, [items, activeFilter]);

  // 2. Group by date
  const groupedItems = useMemo(() => {
    const groups: { title: string; data: HistoryItem[] }[] = [];
    const map = new Map<string, HistoryItem[]>();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    filteredItems.forEach(item => {
      const d = new Date(item.created_at);
      const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      let groupTitle = '';
      if (itemDay.getTime() === today.getTime()) {
        groupTitle = 'Today';
      } else if (itemDay.getTime() === yesterday.getTime()) {
        groupTitle = 'Yesterday';
      } else if (itemDay.getTime() === twoDaysAgo.getTime()) {
        groupTitle = '2 Days Ago';
      } else {
        groupTitle = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!map.has(groupTitle)) {
        const newGroup: HistoryItem[] = [];
        map.set(groupTitle, newGroup);
        groups.push({ title: groupTitle, data: newGroup });
      }
      map.get(groupTitle)?.push(item);
    });

    return groups;
  }, [filteredItems]);

  return {
    items: groupedItems,
    loading,
    refreshing,
    activeFilter,
    setActiveFilter,
    onRefresh,
    hasItems: groupedItems.length > 0
  };
}
