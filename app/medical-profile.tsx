import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';
import { MedicalProfile, EMPTY_PROFILE, BLOOD_TYPES, calcCompleteness } from '../src/types/medical';
import { SectionCard } from '../src/components/medical-profile/SectionCard';
import { TagInput } from '../src/components/medical-profile/TagInput';
import { AllergyInput } from '../src/components/medical-profile/AllergyInput';
import { ICECardModal } from '../src/components/medical-profile/ICECardModal';

export default function MedicalProfileScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<MedicalProfile>(EMPTY_PROFILE);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iceVisible, setIceVisible] = useState(false);

  const [expanded, setExpanded] = useState({
    vitals: true,
    allergies: false,
    conditions: false,
    doctor: false,
  });

  const toggle = useCallback((key: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const completeness = calcCompleteness(profile);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    setUserName(user.user_metadata?.full_name || 'User');

    const { data, error } = await supabase
      .from('medical_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile({
        blood_type: data.blood_type ?? null,
        height_cm: data.height_cm ?? null,
        weight_kg: data.weight_kg ?? null,
        is_organ_donor: data.is_organ_donor ?? false,
        allergies: Array.isArray(data.allergies) ? data.allergies : [],
        conditions: Array.isArray(data.conditions) ? data.conditions : [],
        medications: Array.isArray(data.medications) ? data.medications : [],
        doctor_name: data.doctor_name ?? null,
        doctor_phone: data.doctor_phone ?? null,
        doctor_hospital: data.doctor_hospital ?? null,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    // Pre-flight Security validation
    if (
      (profile.doctor_name && profile.doctor_name.length > 100) ||
      (profile.doctor_phone && profile.doctor_phone.length > 100) ||
      (profile.doctor_hospital && profile.doctor_hospital.length > 100)
    ) {
      Alert.alert('Error', 'Contact fields cannot exceed 100 characters.');
      return;
    }
    
    if (profile.conditions.some(c => c.length > 50) || profile.medications.some(m => m.length > 50) || profile.allergies.some(a => a.name.length > 50)) {
       Alert.alert('Error', 'Individual conditions or medications cannot exceed 50 characters.');
       return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from('medical_profiles')
      .upsert({
        user_id: user.id,
        blood_type: profile.blood_type,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
        is_organ_donor: profile.is_organ_donor,
        allergies: profile.allergies,
        conditions: profile.conditions,
        medications: profile.medications,
        doctor_name: profile.doctor_name ? profile.doctor_name.trim() : null,
        doctor_phone: profile.doctor_phone ? profile.doctor_phone.trim() : null,
        doctor_hospital: profile.doctor_hospital ? profile.doctor_hospital.trim() : null,
      }, { onConflict: 'user_id' });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Your medical profile has been updated.');
    }
  }, [profile]);

  const update = useCallback(<K extends keyof MedicalProfile>(key: K, value: MedicalProfile[K]) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  }, []);
  
  // Memoize all individual update callbacks to avoid re-rendering inputs repeatedly
  const onAddAllergy = useCallback((a: import('../src/types/medical').Allergy) => {
    setProfile(prev => ({ ...prev, allergies: [...prev.allergies, a] }));
  }, []);
  const onRemoveAllergy = useCallback((i: number) => {
    setProfile(prev => ({ ...prev, allergies: prev.allergies.filter((_, idx) => idx !== i) }));
  }, []);
  const onAddCondition = useCallback((t: string) => {
    setProfile(prev => ({ ...prev, conditions: [...prev.conditions, t] }));
  }, []);
  const onRemoveCondition = useCallback((i: number) => {
    setProfile(prev => ({ ...prev, conditions: prev.conditions.filter((_, idx) => idx !== i) }));
  }, []);
  const onAddMedication = useCallback((t: string) => {
    setProfile(prev => ({ ...prev, medications: [...prev.medications, t] }));
  }, []);
  const onRemoveMedication = useCallback((i: number) => {
    setProfile(prev => ({ ...prev, medications: prev.medications.filter((_, idx) => idx !== i) }));
  }, []);
  const onCloseIceModal = useCallback(() => setIceVisible(false), []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const vitalsComplete = !!(profile.blood_type && profile.height_cm && profile.weight_kg);
  const allergiesComplete = profile.allergies.length > 0;
  const conditionsComplete = profile.conditions.length > 0 || profile.medications.length > 0;
  const doctorComplete = !!(profile.doctor_name && profile.doctor_phone);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} accessibilityRole="header">Medical Profile</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save medical profile"
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Completeness bar */}
          <View style={styles.completenessCard} accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
            <View style={styles.completenessTop}>
              <View>
                <Text style={styles.completenessTitle}>Profile Completeness</Text>
                <Text style={styles.completenessSubtitle}>
                  {completeness < 50
                    ? 'Add more info to help first responders'
                    : completeness < 100
                    ? 'Almost there — keep going'
                    : 'Great — your profile is complete!'}
                </Text>
              </View>
              <Text style={[styles.completenessPercent, {
                color: completeness === 100 ? '#00875A' : completeness >= 50 ? colors.primary : '#EA580C'
              }]}>{completeness}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${completeness}%` as import('react-native').DimensionValue,
                backgroundColor: completeness === 100 ? '#00875A' : completeness >= 50 ? colors.primary : '#EA580C',
              }]} />
            </View>
          </View>

          {/* ICE Card button */}
          <TouchableOpacity 
            style={styles.iceBtn} 
            onPress={() => setIceVisible(true)} 
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View In Case of Emergency Card"
          >
            <MaterialCommunityIcons name="shield-cross" size={20} color="#fff" />
            <Text style={styles.iceBtnText}>View ICE Card</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.8)" style={styles.mlAuto} />
          </TouchableOpacity>

          {/* ── Section 1: Vitals ── */}
          <SectionCard
            title="Vitals"
            icon="pulse-outline"
            color="#0A2463"
            expanded={expanded.vitals}
            onToggle={() => toggle('vitals')}
            completeBadge={vitalsComplete}
          >
            {/* Blood type */}
            <Text style={styles.fieldLabel}>Blood Type</Text>
            <View style={styles.bloodTypeRow}>
              {BLOOD_TYPES.map(bt => (
                <TouchableOpacity
                  key={bt}
                  style={[
                    styles.bloodTypeChip,
                    profile.blood_type === bt && styles.bloodTypeChipActive,
                  ]}
                  onPress={() => update('blood_type', profile.blood_type === bt ? null : bt)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: profile.blood_type === bt }}
                  accessibilityLabel={`Blood type ${bt}`}
                >
                  <Text style={[
                    styles.bloodTypeText,
                    profile.blood_type === bt && styles.bloodTypeTextActive,
                  ]}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Height & Weight */}
            <View style={styles.row2}>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.inputField}
                  value={profile.height_cm ? String(profile.height_cm) : ''}
                  onChangeText={t => update('height_cm', t ? parseFloat(t) : null)}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 175"
                  placeholderTextColor={colors.text.secondary}
                  maxLength={5}
                  accessibilityLabel="Height in centimeters"
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.inputField}
                  value={profile.weight_kg ? String(profile.weight_kg) : ''}
                  onChangeText={t => update('weight_kg', t ? parseFloat(t) : null)}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 70"
                  placeholderTextColor={colors.text.secondary}
                  maxLength={5}
                  accessibilityLabel="Weight in kilograms"
                />
              </View>
            </View>

            {/* Organ donor */}
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Organ Donor</Text>
                <Text style={styles.switchSub}>Allow organs to be donated in an emergency</Text>
              </View>
              <Switch
                value={profile.is_organ_donor}
                onValueChange={v => update('is_organ_donor', v)}
                trackColor={{ false: '#E5E7EB', true: '#00875A80' }}
                thumbColor={profile.is_organ_donor ? '#00875A' : '#f4f3f4'}
                accessibilityRole="switch"
                accessibilityLabel="Organ Donor status"
              />
            </View>
          </SectionCard>

          {/* ── Section 2: Allergies ── */}
          <SectionCard
            title="Allergies"
            icon="warning-outline"
            color="#DC2626"
            expanded={expanded.allergies}
            onToggle={() => toggle('allergies')}
            completeBadge={allergiesComplete}
          >
            <Text style={styles.sectionHint}>
              Mark severity so first responders know which require immediate action.
            </Text>
            <AllergyInput
              allergies={profile.allergies}
              onAdd={onAddAllergy}
              onRemove={onRemoveAllergy}
            />
          </SectionCard>

          {/* ── Section 3: Conditions & Medications ── */}
          <SectionCard
            title="Conditions & Medications"
            icon="medical-outline"
            color="#7C3AED"
            expanded={expanded.conditions}
            onToggle={() => toggle('conditions')}
            completeBadge={conditionsComplete}
          >
            <Text style={styles.fieldLabel}>Medical Conditions</Text>
            <TagInput
              tags={profile.conditions}
              onAdd={onAddCondition}
              onRemove={onRemoveCondition}
              placeholder="e.g. Diabetes, Hypertension"
              color="#7C3AED"
            />
            <View style={styles.spacer16} />
            <Text style={styles.fieldLabel}>Current Medications</Text>
            <TagInput
              tags={profile.medications}
              onAdd={onAddMedication}
              onRemove={onRemoveMedication}
              placeholder="e.g. Metformin 500mg"
              color="#7C3AED"
            />
          </SectionCard>

          {/* ── Section 4: Doctor Contact ── */}
          <SectionCard
            title="Doctor Contact"
            icon="person-outline"
            color="#00875A"
            expanded={expanded.doctor}
            onToggle={() => toggle('doctor')}
            completeBadge={doctorComplete}
          >
            <Text style={styles.fieldLabel}>Doctor's Name</Text>
            <TextInput
              style={[styles.inputField, { marginBottom: 14 }]}
              value={profile.doctor_name || ''}
              onChangeText={t => update('doctor_name', t)}
              placeholder="e.g. Dr. Adesola Balogun"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="words"
              maxLength={100}
              accessibilityLabel="Doctor's Name"
            />
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={[styles.inputField, { marginBottom: 14 }]}
              value={profile.doctor_phone || ''}
              onChangeText={t => update('doctor_phone', t)}
              placeholder="e.g. 08012345678"
              placeholderTextColor={colors.text.secondary}
              keyboardType="phone-pad"
              maxLength={100}
              accessibilityLabel="Doctor's Phone Number"
            />
            <Text style={styles.fieldLabel}>Hospital / Clinic</Text>
            <TextInput
              style={styles.inputField}
              value={profile.doctor_hospital || ''}
              onChangeText={t => update('doctor_hospital', t)}
              placeholder="e.g. Lagos University Teaching Hospital"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="words"
              maxLength={100}
              accessibilityLabel="Doctor's Hospital or Clinic"
            />
          </SectionCard>

          <View style={[styles.bottomSpacer, { height: insets.bottom + 20 }]} />
        </ScrollView>

        <ICECardModal
          visible={iceVisible}
          profile={profile}
          userName={userName}
          onClose={onCloseIceModal}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: import('../src/constants/Theme').ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text.primary },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, minWidth: 60, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  completenessCard: {
    backgroundColor: colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
  },
  completenessTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  completenessTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: 3 },
  completenessSubtitle: { fontSize: 13, color: colors.text.secondary },
  completenessPercent: { fontSize: 26, fontWeight: '800' },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  iceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0A2463', borderRadius: 14,
    padding: 16, marginBottom: 16,
  },
  flex: { flex: 1 },
  mlAuto: { marginLeft: 'auto' },
  spacer16: { height: 16 },
  bottomSpacer: { width: '100%' },
  iceBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text.primary, marginBottom: 8 },
  sectionHint: { fontSize: 13, color: colors.text.secondary, marginBottom: 14, lineHeight: 18 },

  bloodTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  bloodTypeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  bloodTypeChipActive: { borderColor: '#0A2463', backgroundColor: '#0A246318' },
  bloodTypeText: { fontSize: 14, fontWeight: '700', color: colors.text.secondary },
  bloodTypeTextActive: { color: '#0A2463' },

  row2: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  inputField: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, fontSize: 15,
    color: colors.text.primary, backgroundColor: colors.background,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  switchSub: { fontSize: 12, color: colors.text.secondary },
});