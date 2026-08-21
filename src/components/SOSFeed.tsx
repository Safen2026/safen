import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSOSFeed, SOSEvent } from '../hooks/useSOSFeed';

interface SOSFeedProps {
  alertId: string;
}

export const SOSFeed = React.memo(({ alertId }: SOSFeedProps) => {
  const { events, loading } = useSOSFeed(alertId);
  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (events.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [events]);

  if (loading && events.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Connecting to live feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>LIVE UPDATES</Text>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.feedScroll} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {events.length === 0 ? (
          <Text style={styles.emptyText}>Waiting for updates...</Text>
        ) : (
          events.map((event, index) => (
            <FeedItem 
              key={event.id} 
              event={event} 
              isLast={index === events.length - 1} 
            />
          ))
        )}
      </ScrollView>
    </View>
  );
});

const FeedItem = React.memo(({ event, isLast }: { event: SOSEvent; isLast: boolean }) => {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  }, [slideAnim, opacityAnim]);

  const date = new Date(event.created_at);
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  
  // Decide icon and color based on event_type
  let iconName: keyof typeof Ionicons.glyphMap = 'information-circle';
  let iconColor = '#8E44AD';
  
  if (event.event_type === 'seen') {
    iconName = 'eye';
    iconColor = '#3498DB';
  } else if (event.event_type === 'responding') {
    iconName = 'shield-checkmark';
    iconColor = '#27AE60';
  } else if (event.event_type === 'system') {
    iconName = 'cog';
    iconColor = '#7F8C8D';
  }

  const actorName = event.profiles?.full_name || 'System';

  return (
    <Animated.View 
      style={[styles.itemContainer, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}
      accessibilityRole="text"
      accessibilityLabel={`${actorName} at ${timeStr}: ${event.message}`}
    >
      <View style={styles.timelineCol}>
        <View style={[styles.iconWrapper, { backgroundColor: iconColor }]}>
          <Ionicons name={iconName} size={14} color="#FFF" />
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.contentCol}>
        <View style={styles.contentHeader}>
          <Text style={styles.actorName}>{actorName}</Text>
          <Text style={styles.timeText}>{timeStr}</Text>
        </View>
        <Text style={styles.messageText}>{event.message}</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 10,
    flex: 1,
    minHeight: 180, // give it some space to grow
  },
  header: {
    color: '#E74C3C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  feedScroll: {
    flex: 1,
  },
  itemContainer: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineCol: {
    width: 30,
    alignItems: 'center',
    marginRight: 12,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#333',
    marginTop: 4,
    marginBottom: 4,
  },
  contentCol: {
    flex: 1,
    paddingBottom: 20,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actorName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  timeText: {
    color: '#888',
    fontSize: 12,
  },
  messageText: {
    color: '#CCC',
    fontSize: 14,
    lineHeight: 20,
  },
});
