import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import type { ThemeColors } from '../src/constants/Theme';
import { supabase } from '../src/lib/supabase';
import { Shadows } from '../src/constants/Theme';

type HistoryItem = {
  id: string;
  source: 'alert' | 'report';
  type: string;
  title: string;
  description?: string;
  address?: string;
  status?: string;
  created_at: string;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Map backend types to UI colors, icons, and filter categories
const TYPE_META: Record<string, { icon: IoniconsName; color: string; label: string; category: string }> = {
  sos: { icon: 'alert', color: '#E02B2B', label: 'Emergency SOS', category: 'SOS' },
  medical: { icon: 'medkit', color: '#10B981', label: 'Medical Assistance', category: 'Medical' },
  police: { icon: 'shield', color: '#2563EB', label: 'Security Request', category: 'Security' },
  fire: { icon: 'flame', color: '#EA580C', label: 'Fire Incident', category: 'Fire' },
  robbery: { icon: 'person', color: '#7C3AED', label: 'Theft / Robbery Report', category: 'Security' },
  accident: { icon: 'car', color: '#D97706', label: 'Accident Report', category: 'Other' },
  other: { icon: 'document-text', color: '#6B7280', label: 'Incident Report', category: 'Other' },
};

const FILTERS = ['All', 'SOS', 'Security', 'Medical', 'Fire', 'Other'];

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch alerts
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('id, type, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      // Fetch reports
      const { data: reportsData } = await supabase
        .from('reports')
        .select('id, type, title, description, address, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      const combined: HistoryItem[] = [];

      (alertsData || []).forEach(a => {
        combined.push({
          id: a.id,
          source: 'alert',
          type: a.type || 'sos',
          title: TYPE_META[a.type]?.label || 'Emergency Alert',
          status: a.status || 'Resolved',
          created_at: a.created_at,
        });
      });

      (reportsData || []).forEach(r => {
        combined.push({
          id: r.id,
          source: 'report',
          type: r.type || 'other',
          title: r.title || TYPE_META[r.type]?.label || 'Incident Report',
          description: r.description,
          address: r.address,
          status: r.status || 'Resolved',
          created_at: r.created_at,
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
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

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
        const newGroup: typeof filteredItems = [];
        map.set(groupTitle, newGroup);
        groups.push({ title: groupTitle, data: newGroup });
      }
      map.get(groupTitle)?.push(item);
    });

    return groups;
  }, [filteredItems]);

  const formatTime = (isoString: string, groupTitle: string) => {
    const d = new Date(isoString);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    // Match screenshot behavior: If it's today, just show time. If yesterday, show "Yesterday, 6:45 PM".
    if (groupTitle === 'Today') return timeStr;
    if (groupTitle === 'Yesterday' || groupTitle === '2 Days Ago') return `${groupTitle}, ${timeStr}`;
    return timeStr;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>History</Text>
        </View>
        <View style={{ width: 24 }} /> {/* Empty spacer to balance header */}
      </View>

      {/* Filter Chips ScrollView */}
      <View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : styles.filterChipInactive
                ]}
                onPress={() => setActiveFilter(filter)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive
                ]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : groupedItems.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.border }]}>
            <Ionicons name="document-text-outline" size={32} color={colors.text.secondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No history found</Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            No events match the selected filter.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {groupedItems.map((group, gIndex) => (
            <View key={group.title} style={styles.groupContainer}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              
              {group.data.map((item) => {
                const meta = TYPE_META[item.type] || TYPE_META.other;
                const locationText = item.address || item.description || 'Location unavailable';

                return (
                  <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.8}>
                    
                    {/* Icon */}
                    <View style={[styles.iconBox, { backgroundColor: meta.color }]}>
                      {meta.category === 'SOS' ? (
                        <Text style={styles.sosIconText}>SOS</Text>
                      ) : (
                        <Ionicons name={meta.icon} size={22} color="#FFFFFF" />
                      )}
                    </View>

                    {/* Content */}
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{meta.label}</Text>
                        <Text style={styles.cardTime}>{formatTime(item.created_at, group.title)}</Text>
                      </View>
                      
                      <Text style={styles.cardLocation} numberOfLines={1}>
                        {locationText}
                      </Text>

                      <View style={styles.cardBottomRow}>
                        {item.status ? (
                          <Text style={styles.statusText}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </Text>
                        ) : null}
                        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                      </View>
                    </View>

                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Light clean background matching UI
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    paddingRight: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  filterIconBtn: {
    padding: 6,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
    shadowOpacity: 0.05,
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: '#E02B2B',
    borderColor: '#E02B2B',
  },
  filterChipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F3F4F6',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipTextInactive: {
    color: '#4B5563',
  },
  list: {
    flex: 1,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    ...Shadows.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  sosIconText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 2,
  },
  cardLocation: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981', // Green for resolved
    backgroundColor: '#10B98115',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
