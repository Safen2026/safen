import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Theme';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';
import { useReport } from '../../src/hooks/useReport';
import { SwipeButton } from '../../src/components/SwipeButton';

type IncidentType = 'medical' | 'fire' | 'security' | 'traffic';

const INCIDENT_CATEGORIES = [
  {
    id: 'medical',
    label: 'Medical',
    icon: 'medical-bag',
    color: '#D92D20',
    bgColor: '#FEF3F2',
  },
  {
    id: 'fire',
    label: 'Fire',
    icon: 'fire',
    color: '#DC6803',
    bgColor: '#FFFAEB',
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'shield-outline',
    color: '#1570EF',
    bgColor: '#EFF8FF',
  },
  {
    id: 'traffic',
    label: 'Traffic',
    icon: 'car',
    color: '#EAB308',
    bgColor: '#FEFCE8',
  },
];

export default function ReportScreen() {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<IncidentType | null>('security');
  const [detailsText, setDetailsText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);

  const { loading, submitReport } = useReport();

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Missing Info', 'Please select an incident type.');
      return;
    }
    const success = await submitReport({
      category: selectedType,
      address: '14 Allen Avenue, Ikeja', // Hardcoded for now
      details: detailsText,
      isAnonymous
    });
    
    if (success) {
      setSuccessModalVisible(true);
    } else {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  const handleCloseSuccess = () => {
    setSuccessModalVisible(false);
    setStep(1);
    setDetailsText('');
    setIsAnonymous(false);
    setSelectedType('security');
  };

  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => step > 1 && setStep(step - 1)}
          disabled={step === 1}
        >
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={step > 1 ? '#00875A' : Colors.text.primary} 
          />
        </TouchableOpacity>
        <View style={styles.stepContainer}>
          <Text style={styles.stepText}>Step {step} of 3</Text>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, step === 1 && styles.dotActive]} />
            <View style={[styles.dot, step === 2 && styles.dotActive]} />
            <View style={[styles.dot, step === 3 && styles.dotActive]} />
          </View>
        </View>
        <View style={styles.headerRight}>
          {step === 3 && (
            <TouchableOpacity style={styles.menuButton}>
              <Ionicons name="ellipsis-vertical" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.divider} />
    </>
  );

  const renderStep1 = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.titleCentered}>What type of emergency is{'\n'}this?</Text>
        <Text style={styles.subtitleCentered}>
          Select the category that best describes the situation.
        </Text>

        <View style={styles.grid}>
          {INCIDENT_CATEGORIES.map((cat) => {
            const isSelected = selectedType === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.card,
                  isSelected && {
                    borderColor: cat.color,
                    backgroundColor: cat.bgColor,
                    borderWidth: 1.5,
                  }
                ]}
                activeOpacity={0.7}
                onPress={() => setSelectedType(cat.id as IncidentType)}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark-circle" size={22} color={cat.color} />
                  </View>
                )}
                <View style={[styles.iconCircle, { backgroundColor: isSelected ? Colors.white : cat.bgColor }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={32} color={cat.color} />
                </View>
                <Text style={styles.cardLabel}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.nextButton, !selectedType && styles.nextButtonDisabled]}
          disabled={!selectedType}
          activeOpacity={0.8}
          onPress={() => setStep(2)}
        >
          <Text style={styles.nextButtonText}>Next: Add Location</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.step2Container}>
        <Text style={styles.titleLeft}>Where is this happening?</Text>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.text.secondary} />
          <TextInput 
            style={styles.searchInput}
            value="14 Allen Avenue, Ikeja"
            editable={false} // Hardcoded for design matching
          />
          <Ionicons name="close" size={20} color={Colors.text.primary} />
        </View>

        <View style={styles.mapContainer}>
          {/* Simulated Map Background */}
          <View style={styles.mapMockBg}>
            {/* Map lines simulation could go here, but a clean color works for a mock */}
          </View>

          {/* Center Map Pin */}
          <View style={styles.mapPinContainer}>
            <View style={styles.mapPinRing}>
              <View style={styles.mapPinCenter} />
            </View>
          </View>

          {/* Use Current Location Button */}
          <TouchableOpacity style={styles.currentLocationBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#00875A" />
            <Text style={styles.currentLocationText}>Use Current Location</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.nextButton}
          activeOpacity={0.8}
          onPress={() => setStep(3)}
        >
          <Text style={styles.nextButtonText}>Next: Add Details</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.titleLeft}>Provide evidence (Optional)</Text>
        <Text style={styles.subtitleLeft}>
          Any media or description helps responders.
        </Text>

        <View style={styles.mediaGrid}>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.7}>
            <Ionicons name="videocam-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.7}>
            <Ionicons name="mic-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Upload from{'\n'}Gallery</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.detailsInput}
          placeholder="Type any additional details here..."
          placeholderTextColor={Colors.text.secondary}
          multiline
          numberOfLines={5}
          value={detailsText}
          onChangeText={setDetailsText}
          textAlignVertical="top"
        />

        <View style={styles.anonymousCard}>
          <View style={styles.anonymousTextContainer}>
            <Text style={styles.anonymousTitle}>Report Anonymously</Text>
            <Text style={styles.anonymousSubtitle}>Your identity will be hidden from responders.</Text>
          </View>
          <Switch
            trackColor={{ false: '#E5E7EB', true: '#AEE4C9' }}
            thumbColor={isAnonymous ? '#00875A' : '#f4f3f4'}
            onValueChange={setIsAnonymous}
            value={isAnonymous}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <SwipeButton onComplete={handleSubmit} loading={loading} />
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {renderHeader()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      
      <ConfirmationModal
        visible={successModalVisible}
        title="Report Submitted"
        message="Your report has been securely transmitted. Responders will review it shortly."
        iconName="checkmark-circle"
        iconColor="#00875A"
        onClose={handleCloseSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  menuButton: {
    padding: 4,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#00875A',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  
  // Step 1 Styles
  scrollContent: {
    padding: 24,
    paddingTop: 32,
  },
  titleCentered: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  subtitleCentered: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 10,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    width: '47%',
    aspectRatio: 0.9,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  
  // Step 2 Styles
  step2Container: {
    flex: 1,
    padding: 24,
    paddingTop: 24,
  },
  titleLeft: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  subtitleLeft: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text.primary,
    fontWeight: '500',
    marginHorizontal: 12,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#D1FAEE', // Light blue/green to mock map water/land
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMockBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E6F4F1',
    opacity: 0.8,
  },
  mapPinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#00875A',
    backgroundColor: 'rgba(0, 135, 90, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinCenter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00875A',
  },
  currentLocationBtn: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    gap: 8,
  },
  currentLocationText: {
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: 15,
  },

  // Step 3 Styles
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  mediaCard: {
    width: '47%',
    aspectRatio: 1.2,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mediaCardText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  detailsInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text.primary,
    minHeight: 120,
    marginBottom: 24,
  },
  anonymousCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  anonymousTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  anonymousTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  anonymousSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  swipeButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    borderRadius: 30,
    padding: 8,
    paddingRight: 24,
  },
  swipeButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00875A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeButtonText: {
    flex: 1,
    textAlign: 'center',
    color: '#00875A',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Common Footer
  footer: {
    padding: 24,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  nextButton: {
    backgroundColor: '#00875A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
