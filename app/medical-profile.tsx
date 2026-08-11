import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Switch, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────
type Severity = 'mild' | 'severe';
type Allergy = { name: string; severity: Severity };

type MedicalProfile = {
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  is_organ_donor: boolean;
  allergies: Allergy[];
  conditions: string[];
  medications: string[];
  doctor_name: string | null;
  doctor_phone: string | null;
  doctor_hospital: string | null;
};

const EMPTY_PROFILE: MedicalProfile = {
  blood_type: null,
  height_cm: null,
  weight_kg: null,
  is_organ_donor: false,
  allergies: [],
  conditions: [],
  medications: [],
  doctor_name: null,
  doctor_phone: null,
  doctor_hospital: null,
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ── Completeness ─────────────────────────────────────────────────────────────
const calcCompleteness = (p: MedicalProfile): number => {
  const checks = [
    !!p.blood_type,
    !!p.height_cm,
    !!p.weight_kg,
    p.allergies.length > 0,
    p.conditions.length > 0,
    p.medications.length > 0,
    !!p.doctor_name,
    !!p.doctor_phone,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionCard = ({
  title, icon, color, expanded, onToggle, children, completeBadge,
}: {
  title: string; icon: string; color: string;
  expanded: boolean; onToggle: () => void;
  children: React.ReactNode; completeBadge?: boolean;
}) => {
  const { colors } = useTheme();
  return (
    <View style={[sectionStyles.card, { borderColor: expanded ? color : colors.border }]}>
      <TouchableOpacity style={sectionStyles.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={[sectionStyles.iconBox, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <Text style={[sectionStyles.title, { color: colors.text.primary }]}>{title}</Text>
        {completeBadge && (
          <View style={sectionStyles.completeBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#00875A" />
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text.secondary}
          style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>
      {expanded && <View style={sectionStyles.body}>{children}</View>}
    </View>
  );
};

const sectionStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1.5, marginBottom: 12, overflow: 'hidden', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  completeBadge: { marginLeft: 8 },
  body: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
});

// ── Tag input ─────────────────────────────────────────────────────────────────
const TagInput = ({
  tags, onAdd, onRemove, placeholder, color,
}: {
  tags: string[]; onAdd: (t: string) => void;
  onRemove: (i: number) => void; placeholder: string; color: string;
}) => {
  const { colors } = useTheme();
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) { onAdd(trimmed); setValue(''); }
  };

  return (
    <View>
      <View style={tagStyles.inputRow}>
        <TextInput
          style={[tagStyles.input, { color: colors.text.primary, borderColor: colors.border, backgroundColor: colors.background }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.text.secondary}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[tagStyles.addBtn, { backgroundColor: color }]}
          onPress={submit}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={tagStyles.tagsRow}>
        {tags.map((tag, i) => (
          <View key={i} style={[tagStyles.tag, { backgroundColor: color + '18', borderColor: color + '40' }]}>
            <Text style={[tagStyles.tagText, { color }]}>{tag}</Text>
            <TouchableOpacity onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={color} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
};

const tagStyles = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 14 },
  addBtn: { width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagText: { fontSize: 13, fontWeight: '600' },
});

// ── Allergy tag input ─────────────────────────────────────────────────────────
const AllergyInput = ({
  allergies, onAdd, onRemove,
}: {
  allergies: Allergy[];
  onAdd: (a: Allergy) => void;
  onRemove: (i: number) => void;
}) => {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [severity, setSeverity] = useState<Severity>('mild');

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) { onAdd({ name: trimmed, severity }); setValue(''); }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <TextInput
          style={[tagStyles.input, { flex: 1, color: colors.text.primary, borderColor: colors.border, backgroundColor: colors.background }]}
          value={value}
          onChangeText={setValue}
          placeholder="e.g. Penicillin"
          placeholderTextColor={colors.text.secondary}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[tagStyles.addBtn, { backgroundColor: '#DC2626' }]}
          onPress={submit}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Severity selector */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['mild', 'severe'] as Severity[]).map(s => (
          <TouchableOpacity
            key={s}
            style={{
              flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
              borderColor: severity === s ? (s === 'severe' ? '#DC2626' : '#EA580C') : colors.border,
              backgroundColor: severity === s ? (s === 'severe' ? '#DC262618' : '#EA580C18') : colors.background,
              alignItems: 'center',
            }}
            onPress={() => setSeverity(s)}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: severity === s ? (s === 'severe' ? '#DC2626' : '#EA580C') : colors.text.secondary }}>
              {s === 'mild' ? '⚠️ Mild' : '🚨 Severe'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={tagStyles.tagsRow}>
        {allergies.map((a, i) => (
          <View key={i} style={[tagStyles.tag, {
            backgroundColor: a.severity === 'severe' ? '#DC262618' : '#EA580C18',
            borderColor: a.severity === 'severe' ? '#DC262640' : '#EA580C40',
          }]}>
            <Text style={{ fontSize: 11, marginRight: 2 }}>{a.severity === 'severe' ? '🚨' : '⚠️'}</Text>
            <Text style={[tagStyles.tagText, { color: a.severity === 'severe' ? '#DC2626' : '#EA580C' }]}>{a.name}</Text>
            <TouchableOpacity onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={a.severity === 'severe' ? '#DC2626' : '#EA580C'} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
};

// ── ICE Card Modal ────────────────────────────────────────────────────────────
const ICECardModal = ({ visible, profile, userName, onClose }: {
  visible: boolean; profile: MedicalProfile; userName: string; onClose: () => void;
}) => {
  const { colors } = useTheme();
  const severeAllergies = profile.allergies.filter(a => a.severity === 'severe');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#0A2463', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="shield-cross" size={28} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 }}>ICE CARD</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginBottom: 16, letterSpacing: 1 }}>IN CASE OF EMERGENCY</Text>

          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 }}>{userName}</Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            {profile.blood_type && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>BLOOD TYPE</Text>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{profile.blood_type}</Text>
              </View>
            )}
            {profile.is_organ_donor && (
              <View style={{ backgroundColor: '#00875A40', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' }}>
                <Text style={{ color: '#4ADE80', fontSize: 13, fontWeight: '700' }}>🫀 Organ Donor</Text>
              </View>
            )}
          </View>

          {severeAllergies.length > 0 && (
            <View style={{ backgroundColor: '#DC262620', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#DC262640' }}>
              <Text style={{ color: '#FCA5A5', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>🚨 SEVERE ALLERGIES</Text>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{severeAllergies.map(a => a.name).join(', ')}</Text>
            </View>
          )}

          {profile.conditions.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>CONDITIONS</Text>
              <Text style={{ color: '#fff', fontSize: 14 }}>{profile.conditions.join(' · ')}</Text>
            </View>
          )}

          {profile.medications.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>MEDICATIONS</Text>
              <Text style={{ color: '#fff', fontSize: 14 }}>{profile.medications.join(' · ')}</Text>
            </View>
          )}

          {profile.doctor_name && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, marginTop: 4 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>DOCTOR</Text>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{profile.doctor_name}</Text>
              {profile.doctor_phone && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 }}>{profile.doctor_phone}</Text>}
              {profile.doctor_hospital && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 1 }}>{profile.doctor_hospital}</Text>}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function MedicalProfileScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

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

  const toggle = (key: keyof typeof expanded) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

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

  const save = async () => {
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
        doctor_name: profile.doctor_name || null,
        doctor_phone: profile.doctor_phone || null,
        doctor_hospital: profile.doctor_hospital || null,
      }, { onConflict: 'user_id' });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Your medical profile has been updated.');
    }
  };

  const update = (key: keyof MedicalProfile, value: any) =>
    setProfile(prev => ({ ...prev, [key]: value }));

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Medical Profile</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
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
          <View style={styles.completenessCard}>
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
                width: `${completeness}%` as any,
                backgroundColor: completeness === 100 ? '#00875A' : completeness >= 50 ? colors.primary : '#EA580C',
              }]} />
            </View>
          </View>

          {/* ICE Card button */}
          <TouchableOpacity style={styles.iceBtn} onPress={() => setIceVisible(true)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="shield-cross" size={20} color="#fff" />
            <Text style={styles.iceBtnText}>View ICE Card</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.8)" style={{ marginLeft: 'auto' }} />
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
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.inputField}
                  value={profile.height_cm ? String(profile.height_cm) : ''}
                  onChangeText={t => update('height_cm', t ? parseFloat(t) : null)}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 175"
                  placeholderTextColor={colors.text.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.inputField}
                  value={profile.weight_kg ? String(profile.weight_kg) : ''}
                  onChangeText={t => update('weight_kg', t ? parseFloat(t) : null)}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 70"
                  placeholderTextColor={colors.text.secondary}
                />
              </View>
            </View>

            {/* Organ donor */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Organ Donor</Text>
                <Text style={styles.switchSub}>Allow organs to be donated in an emergency</Text>
              </View>
              <Switch
                value={profile.is_organ_donor}
                onValueChange={v => update('is_organ_donor', v)}
                trackColor={{ false: '#E5E7EB', true: '#00875A80' }}
                thumbColor={profile.is_organ_donor ? '#00875A' : '#f4f3f4'}
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
              onAdd={a => update('allergies', [...profile.allergies, a])}
              onRemove={i => update('allergies', profile.allergies.filter((_, idx) => idx !== i))}
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
              onAdd={t => update('conditions', [...profile.conditions, t])}
              onRemove={i => update('conditions', profile.conditions.filter((_, idx) => idx !== i))}
              placeholder="e.g. Diabetes, Hypertension"
              color="#7C3AED"
            />
            <View style={{ height: 16 }} />
            <Text style={styles.fieldLabel}>Current Medications</Text>
            <TagInput
              tags={profile.medications}
              onAdd={t => update('medications', [...profile.medications, t])}
              onRemove={i => update('medications', profile.medications.filter((_, idx) => idx !== i))}
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
            />
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={[styles.inputField, { marginBottom: 14 }]}
              value={profile.doctor_phone || ''}
              onChangeText={t => update('doctor_phone', t)}
              placeholder="e.g. 08012345678"
              placeholderTextColor={colors.text.secondary}
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldLabel}>Hospital / Clinic</Text>
            <TextInput
              style={styles.inputField}
              value={profile.doctor_hospital || ''}
              onChangeText={t => update('doctor_hospital', t)}
              placeholder="e.g. Lagos University Teaching Hospital"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="words"
            />
          </SectionCard>

          <View style={{ height: 40 }} />
        </ScrollView>

        <ICECardModal
          visible={iceVisible}
          profile={profile}
          userName={userName}
          onClose={() => setIceVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
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