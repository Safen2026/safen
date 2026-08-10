import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
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

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  sos: { icon: 'alert-circle', color: '#E02B2B', label: 'SOS Alert' },
  medical: { icon: 'medkit', color: '#DC2626', label: 'Medical Assistance' },
  police: { icon: 'shield', color: '#2563EB', label: 'Police Request' },
  fire: { icon: 'flame', color: '#EA580C', label: 'Fire Emergency' },
  robbery: { icon: 'warning', color: '#7C3AED', label: 'Incident Report (Robbery)' },
  accident: { icon: 'car-sport', color: '#D97706', label: 'Incident Report (Accident)' },
  harassment: { icon: 'hand-left', color: '#DB2777', label: 'Incident Report (Harassment)' },
  hazard: { icon: 'alert-triangle', color: '#EA580C', label: 'Hazard Report' },
  other: { icon: 'document-text', color: '#6B7280', label: 'Incident Report' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;
  if (diffDays < 7) return `${diffDays} days ago at ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` · ${timeStr}`;
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'alert' | 'report'>('all');

  const fetchHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }

      // 1. Fetch user alerts
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('id, type, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      // 2. Fetch user reports
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
          status: a.status || 'resolved',
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
          status: r.status || 'submitted',
          created_at: r.created_at,
        });
      });

      // Sort newest first
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

  const filteredItems = items.filter(i => {
    if (filter === 'all') return true;
    return i.source === filter;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>History & Logs</Text>

        <View style={{ width: 36 }} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'alert', label: 'SOS & Alerts' },
            { id: 'report', label: 'Reports' },
          ] as const
        ).map(tab => {
          const active = filter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.filterTab,
                {
                  backgroundColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(tab.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: active ? '#fff' : colors.text.secondary },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.border }]}>
            <Ionicons name="time-outline" size={32} color={colors.text.secondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No activity history yet</Text>
          <Text style={[styles.emptySub, { color: colors.text.secondary }]}>
            Past SOS activations, incident reports, and emergency alerts will appear here.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filteredItems.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.other;
            const isAlert = item.source === 'alert';

            return (
              <View
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.white,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.typeIconBox, { backgroundColor: meta.color + '15' }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>

                  <View style={styles.cardTitleBlock}>
                    <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.cardTime, { color: colors.text.secondary }]}>
                      {formatDate(item.created_at)}
                    </Text>
                  </View>

                  {item.status && (
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            item.status === 'active'
                              ? '#FEE2E2'
                              : item.status === 'resolved' || item.status === 'submitted'
                              ? '#DCFCE7'
                              : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          {
                            color:
                              item.status === 'active'
                                ? '#DC2626'
                                : item.status === 'resolved' || item.status === 'submitted'
                                ? '#16A34A'
                                : colors.text.secondary,
                          },
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                {item.description ? (
                  <Text style={[styles.cardDesc, { color: colors.text.secondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {item.address ? (
                  <View style={styles.addressRow}>
                    <Ionicons name="location-outline" size={13} color={colors.text.secondary} />
                    <Text style={[styles.addressText, { color: colors.text.secondary }]} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 8,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardTime: {
    fontSize: 11,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  addressText: {
    fontSize: 11,
    flex: 1,
  },
});
