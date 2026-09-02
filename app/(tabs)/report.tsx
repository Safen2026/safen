import React, { useState, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/Theme';
import { showToast } from '../../src/utils/toast';
import { useReport } from '../../src/hooks/useReport';
import { useReportMedia } from '../../src/hooks/useReportMedia';
import { useReportLocation } from '../../src/hooks/useReportLocation';

// Components
import { ReportHeader } from '../../src/components/report/ReportHeader';
import { IncidentTypeSelection, IncidentType } from '../../src/components/report/IncidentTypeSelection';
import { LocationSelection } from '../../src/components/report/LocationSelection';
import { EvidenceCollection } from '../../src/components/report/EvidenceCollection';
import { MediaPreviewModal } from '../../src/components/report/MediaPreviewModal';
import { AudioRecordingModal } from '../../src/components/report/AudioRecordingModal';

export default function ReportScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  
  // State
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<IncidentType | null>('security');
  const [detailsText, setDetailsText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  const [policeReference, setPoliceReference] = useState('');

  // Hooks
  const { loading, submitReport } = useReport();
  
  const {
    mediaFiles,
    selectedPreview,
    setSelectedPreview,
    recording,
    recordingDuration,
    pulseAnim,
    showError,
    handleTakePhoto,
    handleRecordVideo,
    handlePickLibrary,
    startRecording,
    stopRecording,
    removeMedia,
    clearSelectedPreview,
    clearMedia,
  } = useReportMedia();

  const {
    location,
    address,
    setAddress,
    locationDetails,
    setLocationDetails,
    isFullScreenMap,
    setIsFullScreenMap,
    mapRef,
    fetchCurrentLocation,
    handleRegionChangeComplete,
    geocodeAddress,
    clearLocation,
  } = useReportLocation();

  // Handlers
  const handleBack = useCallback(() => {
    if (step > 1) setStep(step - 1);
  }, [step]);

  const handleNextToLocation = useCallback(() => {
    setStep(2);
    // Auto-fetch location when entering step 2 if we don't have one
    if (!location) {
      fetchCurrentLocation();
    }
  }, [location, fetchCurrentLocation]);

  const handleNextToEvidence = useCallback(() => {
    setStep(3);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) {
      showError('Missing Info', 'Please select an incident type.');
      return;
    }
    const combinedDetails = locationDetails.trim() 
      ? `Location Note: ${locationDetails.trim()}\n\nIncident Details: ${detailsText}`
      : detailsText;

    const result = await submitReport({
      category: selectedType,
      address: address,
      details: combinedDetails,
      isAnonymous,
      media: mediaFiles,
      latitude: location?.coords.latitude,
      longitude: location?.coords.longitude,
      lastSeenAt: selectedType === 'missing_person' ? lastSeenAt?.toISOString() ?? null : null,
      policeReference: selectedType === 'missing_person' ? policeReference.trim() : null,
    });

    if (result.ok) {
      showToast({
        title: 'Report Submitted',
        subtitle: result.degraded
          ? 'Report sent. We could not fully verify it, so it may be reviewed.'
          : 'Your report has been securely transmitted.',
        icon: 'checkmark-circle',
      });
      // Reset form immediately
      handleCloseSuccess();
      return;
    }

    switch (result.reason) {
      case 'quality':
        showError('A bit more detail, please', 
          result.strikesLeft <= 1
            ? `${result.feedback}\n\nOne more incomplete report will pause submissions for a short while.`
            : result.feedback
        );
        break;
      case 'paused':
        showError('Submissions paused', 'Too many incomplete reports. Please try again in a little while. SOS still works normally.');
        break;
      case 'gate':
        showError('Missing required information', result.message);
        break;
      default:
        showError('Error', 'Failed to submit report. Please try again.');
    }
  }, [selectedType, locationDetails, detailsText, address, isAnonymous, mediaFiles, location, lastSeenAt, policeReference, submitReport, showError]);

  const handleCloseSuccess = useCallback(() => {
    setStep(1);
    setDetailsText('');
    setIsAnonymous(false);
    setSelectedType('security');
    clearMedia();
    clearLocation();
    setLastSeenAt(null);
    setPoliceReference('');
  }, [clearMedia, clearLocation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.flex} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ReportHeader 
          step={step} 
          onBack={handleBack} 
          colors={colors} 
        />
        
        {step === 1 && (
          <IncidentTypeSelection
            selectedType={selectedType}
            onSelectType={setSelectedType}
            onNext={handleNextToLocation}
            colors={colors}
            isDark={isDark}
          />
        )}
        
        {step === 2 && (
          <LocationSelection
            location={location}
            address={address}
            setAddress={setAddress}
            locationDetails={locationDetails}
            setLocationDetails={setLocationDetails}
            isFullScreenMap={isFullScreenMap}
            setIsFullScreenMap={setIsFullScreenMap}
            mapRef={mapRef}
            handleRegionChangeComplete={handleRegionChangeComplete}
            fetchCurrentLocation={fetchCurrentLocation}
            geocodeAddress={geocodeAddress}
            onNext={handleNextToEvidence}
            colors={colors}
          />
        )}
        
        {step === 3 && (
          <EvidenceCollection
            mediaFiles={mediaFiles}
            detailsText={detailsText}
            setDetailsText={setDetailsText}
            isAnonymous={isAnonymous}
            setIsAnonymous={setIsAnonymous}
            selectedType={selectedType}
            lastSeenAt={lastSeenAt}
            setLastSeenAt={setLastSeenAt}
            policeReference={policeReference}
            setPoliceReference={setPoliceReference}
            handleTakePhoto={handleTakePhoto}
            handleRecordVideo={handleRecordVideo}
            handlePickLibrary={handlePickLibrary}
            startRecording={startRecording}
            removeMedia={removeMedia}
            setSelectedPreview={setSelectedPreview}
            onSubmit={handleSubmit}
            loading={loading}
            colors={colors}
          />
        )}

        <MediaPreviewModal
          selectedPreview={selectedPreview}
          onClose={clearSelectedPreview}
          colors={colors}
        />

        <AudioRecordingModal
          recording={recording}
          recordingDuration={recordingDuration}
          pulseAnim={pulseAnim}
          onStop={stopRecording}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: {
    flex: 1,
  },
});
