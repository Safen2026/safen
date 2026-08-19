import React, { memo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MedicalProfile } from '../../types/medical';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/Theme';

interface ICECardModalProps {
  visible: boolean;
  profile: MedicalProfile;
  userName: string;
  onClose: () => void;
}

export const ICECardModal = memo(function ICECardModal({
  visible,
  profile,
  userName,
  onClose,
}: ICECardModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const severeAllergies = profile.allergies.filter(a => a.severity === 'severe');

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="slide" 
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <MaterialCommunityIcons name="shield-cross" size={28} color={colors.white} />
              <Text style={styles.modalTitleText}>ICE CARD</Text>
            </View>
            <TouchableOpacity 
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close ICE Card"
            >
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitleText}>IN CASE OF EMERGENCY</Text>

          <Text style={styles.userNameText}>{userName}</Text>

          <View style={styles.row}>
            {profile.blood_type && (
              <View style={styles.bloodTypeCard}>
                <Text style={styles.bloodTypeLabel}>BLOOD TYPE</Text>
                <Text style={styles.bloodTypeValue}>{profile.blood_type}</Text>
              </View>
            )}
            {profile.is_organ_donor && (
              <View style={styles.organDonorCard}>
                <Text style={styles.organDonorText}>🫀 Organ Donor</Text>
              </View>
            )}
          </View>

          {severeAllergies.length > 0 && (
            <View style={styles.allergiesCard}>
              <Text style={styles.allergiesTitle}>🚨 SEVERE ALLERGIES</Text>
              <Text style={styles.allergiesText}>{severeAllergies.map(a => a.name).join(', ')}</Text>
            </View>
          )}

          {profile.conditions.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>CONDITIONS</Text>
              <Text style={styles.sectionContent}>{profile.conditions.join(' · ')}</Text>
            </View>
          )}

          {profile.medications.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>MEDICATIONS</Text>
              <Text style={styles.sectionContent}>{profile.medications.join(' · ')}</Text>
            </View>
          )}

          {profile.doctor_name && (
            <View style={styles.doctorCard}>
              <Text style={styles.sectionTitle}>DOCTOR</Text>
              <Text style={styles.doctorName}>{profile.doctor_name}</Text>
              {profile.doctor_phone ? <Text style={styles.doctorSubtext}>{profile.doctor_phone}</Text> : null}
              {profile.doctor_hospital ? <Text style={styles.doctorSmallText}>{profile.doctor_hospital}</Text> : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitleText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 1,
  },
  userNameText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  bloodTypeCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bloodTypeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  bloodTypeValue: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  organDonorCard: {
    backgroundColor: '#00875A40',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  organDonorText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '700',
  },
  allergiesCard: {
    backgroundColor: '#DC262620',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DC262640',
  },
  allergiesTitle: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  allergiesText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionContainer: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionContent: {
    color: colors.white,
    fontSize: 14,
  },
  doctorCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  doctorName: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  doctorSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 2,
  },
  doctorSmallText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 1,
  },
});
