import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Switch, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { ThemeColors } from '../../constants/Theme';
import { SwipeButton } from '../SwipeButton';
import { Shadows } from '../../constants/Theme';
import type { IncidentType } from './IncidentTypeSelection';

interface EvidenceCollectionProps {
  mediaFiles: string[];
  detailsText: string;
  setDetailsText: (text: string) => void;
  isAnonymous: boolean;
  setIsAnonymous: (val: boolean) => void;
  selectedType: IncidentType | null;
  lastSeenAt: Date | null;
  setLastSeenAt: (d: Date | null) => void;
  policeReference: string;
  setPoliceReference: (s: string) => void;
  handleTakePhoto: () => void;
  handleRecordVideo: () => void;
  handlePickLibrary: () => void;
  startRecording: () => void;
  removeMedia: (index: number) => void;
  setSelectedPreview: (uri: string) => void;
  onSubmit: () => void;
  loading: boolean;
  colors: ThemeColors;
}

export const EvidenceCollection = React.memo(function EvidenceCollection({
  mediaFiles,
  detailsText,
  setDetailsText,
  isAnonymous,
  setIsAnonymous,
  selectedType,
  lastSeenAt,
  setLastSeenAt,
  policeReference,
  setPoliceReference,
  handleTakePhoto,
  handleRecordVideo,
  handlePickLibrary,
  startRecording,
  removeMedia,
  setSelectedPreview,
  onSubmit,
  loading,
  colors
}: EvidenceCollectionProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  // Android: two-step picker — first 'date', then 'time'.
  // iOS:     single inline spinner, always visible.
  // mode="datetime" is iOS-only; using it on Android causes a blank screen
  // with no dismiss path because the native Android dialog doesn't support it.
  const [pickerStep, setPickerStep] = React.useState<'closed' | 'date' | 'time'>('closed');
  // Holds the date portion while we wait for the time step.
  const pendingDateRef = React.useRef<Date | null>(null);

  const openDatePicker = React.useCallback(() => {
    pendingDateRef.current = null;
    setPickerStep('date');
  }, []);

  const handleDateChange = React.useCallback((event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type !== 'set' || !picked) {
        // User cancelled — close the whole flow.
        setPickerStep('closed');
        return;
      }
      if (pickerStep === 'date') {
        // Date confirmed — stash it and open the time picker.
        pendingDateRef.current = picked;
        setPickerStep('time');
      } else {
        // Time confirmed — combine with stashed date and commit.
        const base = pendingDateRef.current ?? lastSeenAt ?? new Date();
        const combined = new Date(base);
        combined.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        setLastSeenAt(combined);
        setPickerStep('closed');
      }
    } else {
      // iOS inline — every onChange is a live update, just save it.
      if (picked) setLastSeenAt(picked);
    }
  }, [pickerStep, lastSeenAt, setLastSeenAt]);

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.titleLeft} accessibilityRole="header">Provide evidence (Optional)</Text>
        <Text style={styles.subtitleLeft}>
          Any media or description helps responders.
        </Text>

        <View style={styles.mediaGrid}>
          <TouchableOpacity 
            style={styles.mediaCard} 
            activeOpacity={0.5} 
            onPress={handleTakePhoto}
            accessibilityRole="button"
            accessibilityLabel="Take Photo"
          >
            <Ionicons name="camera-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mediaCard} 
            activeOpacity={0.5} 
            onPress={handleRecordVideo}
            accessibilityRole="button"
            accessibilityLabel="Record Video"
          >
            <Ionicons name="videocam-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Video</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mediaCard} 
            activeOpacity={0.5} 
            onPress={startRecording}
            accessibilityRole="button"
            accessibilityLabel="Record Audio"
          >
            <Ionicons name="mic-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mediaCard} 
            activeOpacity={0.5} 
            onPress={handlePickLibrary}
            accessibilityRole="button"
            accessibilityLabel="Upload from Gallery"
          >
            <Ionicons name="image-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Upload from{'\n'}Gallery</Text>
          </TouchableOpacity>
        </View>

        {mediaFiles.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaList}>
            {mediaFiles.map((uri, index) => {
              const isVideo = uri.endsWith('.mp4') || uri.endsWith('.mov') || uri.includes('video');
              const isAudio = uri.endsWith('.m4a') || uri.endsWith('.caf') || uri.includes('audio') || uri.includes('recording');
              
              return (
                <View key={index} style={styles.mediaPreviewContainer}>
                  <TouchableOpacity 
                    activeOpacity={0.8} 
                    onPress={() => setSelectedPreview(uri)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview media item ${index + 1}`}
                  >
                    {isAudio ? (
                      <View style={[styles.mediaPreview, { backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="mic" size={32} color={colors.primary} />
                      </View>
                    ) : (
                      <Image source={{ uri }} style={styles.mediaPreview} />
                    )}
                    
                    {/* Play icon overlay for videos and audio */}
                    {(isVideo || isAudio) && (
                      <View style={styles.videoOverlayIcon}>
                        <Ionicons name="play-circle" size={32} color={isAudio ? colors.primary : "#FFF"} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.removeMediaBtn} 
                    onPress={() => removeMedia(index)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove media item ${index + 1}`}
                  >
                    <Ionicons name="close" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}

        <TextInput
          style={styles.detailsInput}
          placeholder="Type any additional details here..."
          placeholderTextColor={colors.text.secondary}
          multiline
          numberOfLines={5}
          value={detailsText}
          onChangeText={setDetailsText}
          textAlignVertical="top"
          accessibilityLabel="Additional details input"
        />

        {selectedType === 'missing_person' && (
          <View style={styles.missingPersonSection}>
            <Text style={styles.missingPersonLabel}>When were they last seen?</Text>

            {/* Android: pressable row opens the two-step date → time flow */}
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.dateRow}
                activeOpacity={0.7}
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel="Select date and time last seen"
              >
                <Ionicons name="calendar-outline" size={20} color={colors.text.secondary} />
                <Text style={[styles.dateRowText, !lastSeenAt && { color: colors.text.secondary }]}>
                  {lastSeenAt
                    ? lastSeenAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Tap to set date & time'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            )}

            {/* Android step 1 — date dialog */}
            {Platform.OS === 'android' && pickerStep === 'date' && (
              <DateTimePicker
                value={lastSeenAt ?? new Date()}
                mode="date"
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
            )}

            {/* Android step 2 — time dialog */}
            {Platform.OS === 'android' && pickerStep === 'time' && (
              <DateTimePicker
                value={pendingDateRef.current ?? lastSeenAt ?? new Date()}
                mode="time"
                is24Hour={true}
                onChange={handleDateChange}
              />
            )}

            {/* iOS: inline spinner — display="spinner" works well inside a ScrollView */}
            {Platform.OS === 'ios' && (
              <DateTimePicker
                value={lastSeenAt ?? new Date()}
                mode="datetime"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleDateChange}
                style={{ alignSelf: 'flex-start', marginLeft: -8 }}
              />
            )}

            <Text style={styles.missingPersonLabel}>Police station and case reference</Text>
            <TextInput
              value={policeReference}
              onChangeText={setPoliceReference}
              placeholder="e.g. Ikeja Division / CR-1123"
              placeholderTextColor={colors.text.secondary}
              style={styles.policeRefInput}
              accessibilityLabel="Police station and case reference"
            />

            <Text style={styles.missingPersonHint}>
              A photo, the time last seen, the location, and a police reference number are all required before a missing-person report can be filed.
            </Text>
          </View>
        )}

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
            accessibilityRole="switch"
            accessibilityLabel="Toggle anonymous reporting"
            accessibilityState={{ checked: isAnonymous }}
          />
        </View>

        <View style={{ marginTop: 32 }}>
          <SwipeButton onComplete={onSubmit} loading={loading} />
        </View>
      </ScrollView>
    </>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  scrollContent: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 60, // Prevents SwipeButton from tucking into bottom tabs
  },
  titleLeft: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
  },
  subtitleLeft: {
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 24,
    lineHeight: 22,
  },
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
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mediaCardText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  mediaList: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  mediaPreviewContainer: {
    marginRight: 12,
    marginTop: 8,
    position: 'relative',
  },
  mediaPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  videoOverlayIcon: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  detailsInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    height: 120,
    fontSize: 15,
    color: colors.text.primary,
    textAlignVertical: 'top',
    marginBottom: 24,
    ...Shadows.sm,
  },
  anonymousCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  anonymousTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  anonymousTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  anonymousSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // ── Missing person section ──────────────────────────────────────────────────
  missingPersonSection: {
    marginBottom: 24,
    gap: 12,
  },
  missingPersonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    ...Shadows.sm,
  },
  dateRowText: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },
  policeRefInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    color: colors.text.primary,
    backgroundColor: colors.white,
    fontSize: 15,
    ...Shadows.sm,
  },
  missingPersonHint: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});
