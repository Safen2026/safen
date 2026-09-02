import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/Theme';
import { useHistory, HistoryItem } from '../../src/hooks/useHistory';
import { HistoryFilterChips } from '../../src/components/history/HistoryFilterChips';
import { HistoryCard } from '../../src/components/history/HistoryCard';
import { HistoryEmptyState } from '../../src/components/history/HistoryEmptyState';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const {
    items,
    loading,
    refreshing,
    activeFilter,
    setActiveFilter,
    onRefresh,
    hasItems
  } = useHistory();

  // Memoized navigation handler — stable reference prevents HistoryCard re-renders
  const handleCardPress = useCallback((item: HistoryItem) => {
    router.push(`/history/${item.id}?source=${item.source}`);
  }, []);

  // Memoized renderItem — prevents FlatList/SectionList child re-renders on scroll
  const renderItem = useCallback(
    ({ item, section }: { item: HistoryItem; section: { title: string } }) => (
      <HistoryCard item={item} groupTitle={section.title} onPress={handleCardPress} />
    ),
    [handleCardPress]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>History</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterWrapper}>
        <HistoryFilterChips 
          activeFilter={activeFilter} 
          onSelectFilter={setActiveFilter} 
        />
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasItems ? (
        <HistoryEmptyState />
      ) : (
        <SectionList
          sections={items}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.groupTitle, { color: colors.text.primary }]}>
              {title}
            </Text>
          )}
          
          renderItem={renderItem}
          
          // Performance optimizations for large lists
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
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
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  filterWrapper: {
    marginBottom: 10,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 16,
    marginLeft: 4,
    letterSpacing: -0.2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
