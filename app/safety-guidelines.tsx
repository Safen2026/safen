import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';

type Guideline = {
  key: string;
  title: string;
  icon: string;
  iconSet: 'ion' | 'mci';
  color: string;
  points: string[];
};

const GUIDELINES: Guideline[] = [
  {
    key: 'setup',
    title: 'Before You Need It',
    icon: 'shield-checkmark-outline',
    iconSet: 'ion',
    color: '#00875A',
    points: [
      'Add at least 2–3 emergency contacts, and try to get contacts who are also on Safen — they get instant in-app alerts.',
      'Fill in your Medical Profile (blood type, allergies, conditions, medications) so first responders have what they need if you can\'t speak for yourself.',
      'Keep your "at home" status current in the app so contacts can tell your situation at a glance.',
      'Test the SOS button once in a safe moment so the hold-to-trigger motion is familiar before you ever need it under pressure.',
    ],
  },
  {
    key: 'sos',
    title: 'During an SOS or Quick Action',
    icon: 'alert-circle',
    iconSet: 'ion',
    color: '#E02B2B',
    points: [
      'Press and hold the SOS button — a short press won\'t trigger it, this prevents accidental alerts.',
      'Once triggered, your on-app emergency contacts are notified immediately with your location.',
      'If it was an accident, use Cancel right away — contacts will see the alert was cancelled.',
      'Medical, Police, and Fire quick actions work the same way, but let your contacts know exactly what kind of help you may need.',
      'Try to stay in one place if it\'s safe to do so — your location updates as long as the alert is active.',
    ],
  },
  {
    key: 'reporting',
    title: 'Filing a Safety Report',
    icon: 'document-text-outline',
    iconSet: 'ion',
    color: '#7C3AED',
    points: [
      'Use Report for incidents that aren\'t an active emergency for you personally — suspicious activity, a hazard, something you witnessed.',
      'Pick the category that fits best (Medical, Fire, Security, Traffic) — it helps anyone reviewing reports triage faster.',
      'Photos, video, or audio make a report far more useful — attach what you safely can.',
      'The anonymous toggle hides your identity from anyone reviewing the report, but the report is still linked to your account for accountability.',
      'Your location is attached automatically — you can adjust the pin if the incident happened somewhere other than where you\'re standing.',
    ],
  },
  {
    key: 'everyday',
    title: 'Everyday Personal Safety',
    icon: 'walk-outline',
    iconSet: 'ion',
    color: '#2563EB',
    points: [
      'Trust your instincts — if a situation feels wrong, it\'s okay to leave, even if you can\'t explain exactly why.',
      'Share your live location with a trusted contact when heading somewhere unfamiliar or meeting someone new.',
      'Keep your phone charged before heading out — a dead phone can\'t call for help.',
      'Vary your routes and routines occasionally, especially if you ever feel like you\'re being watched or followed.',
      'Let someone know your expected return time when going somewhere alone.',
    ],
  },
  {
    key: 'contact',
    title: 'Being Someone\'s Emergency Contact',
    icon: 'people-outline',
    iconSet: 'ion',
    color: '#DC6803',
    points: [
      'If you get an SOS or report notification from someone who added you, take it seriously — check in immediately.',
      'Tapping a notification shows you the type of alert and last known location.',
      'If you can\'t reach them and the alert stays active, consider contacting local emergency services directly.',
      'Being listed as someone\'s contact is a responsibility — make sure notifications are enabled so you don\'t miss one.',
    ],
  },
];

export default function SafetyGuidelinesScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [expandedKey, setExpandedKey] = useState<string | null>('setup');

  const toggle = (key: string) => setExpandedKey(prev => (prev === key ? null : key));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety Guidelines</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          A quick reference for getting the most out of Safen — and staying safer generally.
        </Text>

        {GUIDELINES.map(section => {
          const isExpanded = expandedKey === section.key;
          const IconComponent = section.iconSet === 'mci' ? MaterialCommunityIcons : Ionicons;
          return (
            <View key={section.key} style={[styles.card, { borderColor: isExpanded ? section.color : colors.border }]}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => toggle(section.key)} activeOpacity={0.7}>
                <View style={[styles.iconBox, { backgroundColor: section.color + '18' }]}>
                  <IconComponent name={section.icon as any} size={20} color={section.color} />
                </View>
                <Text style={styles.cardTitle}>{section.title}</Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.cardBody}>
                  {section.points.map((point, i) => (
                    <View key={i} style={styles.pointRow}>
                      <View style={[styles.bullet, { backgroundColor: section.color }]} />
                      <Text style={styles.pointText}>{point}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.footerNoteText}>
            These guidelines are general safety information, not professional emergency
            training. In a life-threatening situation, contact local emergency services directly.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text.primary },

  intro: { fontSize: 14, color: colors.text.secondary, lineHeight: 20, marginBottom: 16 },

  card: {
    backgroundColor: colors.white, borderRadius: 14,
    borderWidth: 1.5, marginBottom: 12, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text.primary },

  cardBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  pointRow: { flexDirection: 'row', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  pointText: { flex: 1, fontSize: 13.5, color: colors.text.secondary, lineHeight: 19 },

  footerNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginTop: 8, paddingHorizontal: 4,
  },
  footerNoteText: { flex: 1, fontSize: 12, color: colors.text.secondary, lineHeight: 17 },
});
