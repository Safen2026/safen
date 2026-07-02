import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { Shadows } from '../../src/constants/Theme';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';
import { useReport } from '../../src/hooks/useReport';
import { SwipeButton } from '../../src/components/SwipeButton';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Video, Audio, ResizeMode } from 'expo-av';
import { Modal } from 'react-native';
import * as Location from 'expo-location';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';

type IncidentType = 'medical' | 'fire' | 'security' | 'traffic';

const INCIDENT_CATEGORIES = [
  {
    id: 'medical',
    label: 'Medical',
    icon: 'medical-bag',
    color: '#D92D20',
    bgColor: '#FEF3F2',
    darkBgColor: '#3F1D1D',
  },
  {
    id: 'fire',
    label: 'Fire',
    icon: 'fire',
    color: '#DC6803',
    bgColor: '#FFFAEB',
    darkBgColor: '#3D250E',
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'shield-outline',
    color: '#1570EF',
    bgColor: '#EFF8FF',
    darkBgColor: '#172B4D',
  },
  {
    id: 'traffic',
    label: 'Traffic',
    icon: 'car',
    color: '#EAB308',
    bgColor: '#FEFCE8',
    darkBgColor: '#3F3315',
  },
];

export default function ReportScreen() {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<IncidentType | null>('security');
  const [detailsText, setDetailsText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const mapRef = React.useRef<MapView>(null);

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState('Fetching location...');

  const handleRegionChangeComplete = async (region: any) => {
    try {
      setLocation(prev => prev ? {
        ...prev,
        coords: {
          ...prev.coords,
          latitude: region.latitude,
          longitude: region.longitude
        }
      } : null);
      
      setAddress('Fetching location...');
      let geocode = await Location.reverseGeocodeAsync({
        latitude: region.latitude,
        longitude: region.longitude
      });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        
        // Filter out Plus Codes (e.g. 6FR5RC8J+Q6R)
        let primaryName = place.street;
        if (!primaryName && place.name && !place.name.includes('+')) {
          primaryName = place.name;
        }
        
        // If we still don't have a street, use the district/neighborhood
        if (!primaryName) {
          primaryName = place.district || 'Unnamed Road';
        }

        const formattedAddress = `${place.streetNumber ? place.streetNumber + ' ' : ''}${primaryName}, ${place.city || place.subregion || place.region}`;
        setAddress(formattedAddress);
      } else {
        setAddress('Location found, address unknown');
      }
    } catch (e) {
      setAddress('Location found');
    }
  };

  const { loading, submitReport } = useReport();

  const handleTakePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      setErrorModal({
        visible: true,
        title: 'Limit Reached',
        message: 'You can only attach up to 4 media items per report.'
      });
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setErrorModal({
        visible: true,
        title: 'Permission Required',
        message: 'Please grant camera access in your device settings to take photos.'
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled) {
      setMediaFiles(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handleRecordVideo = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      setErrorModal({
        visible: true,
        title: 'Limit Reached',
        message: 'You can only attach up to 4 media items per report.'
      });
      return;
    }
    
    const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
    
    if (cameraPerm.status !== 'granted') {
      setErrorModal({
        visible: true,
        title: 'Permissions Required',
        message: 'Please grant camera access in your device settings to record video.'
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });

    if (!result.canceled) {
      setMediaFiles(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handlePickLibrary = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      setErrorModal({
        visible: true,
        title: 'Limit Reached',
        message: 'You can only attach up to 4 media items per report.'
      });
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErrorModal({
        visible: true,
        title: 'Permission Required',
        message: 'Please grant photo gallery access in your device settings.'
      });
      return;
    }

    const maxSelections = 4 - mediaFiles.length;
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: maxSelections,
      quality: 0.7,
    });

    if (!result.canceled) {
      const newUris = result.assets.map(a => a.uri);
      setMediaFiles(prev => [...prev, ...newUris].slice(0, 4));
    }
  };

  const startRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mediaFiles.length >= 4) {
      setErrorModal({
        visible: true,
        title: 'Limit Reached',
        message: 'You can only attach up to 4 media items per report.'
      });
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setErrorModal({
          visible: true,
          title: 'Permission Required',
          message: 'Please grant microphone access in your device settings.'
        });
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } catch (err) {
      setErrorModal({
        visible: true,
        title: 'Error',
        message: 'Failed to start recording.'
      });
    }
  };

  const stopRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      if (uri) {
        setMediaFiles(prev => [...prev, uri]);
      }
    } catch (err) {
      // Ignore errors if stopped abruptly
    }
    setRecording(null);
    pulseAnim.setValue(1);
    Animated.loop(Animated.timing(pulseAnim, { toValue: 1, duration: 10, useNativeDriver: true })).stop();
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      setErrorModal({
        visible: true,
        title: 'Missing Info',
        message: 'Please select an incident type.'
      });
      return;
    }
    const success = await submitReport({
      category: selectedType,
      address: address,
      details: detailsText,
      isAnonymous,
      media: mediaFiles,
      latitude: location?.coords.latitude,
      longitude: location?.coords.longitude
    });
    
    if (success) {
      setSuccessModalVisible(true);
    } else {
      setErrorModal({
        visible: true,
        title: 'Error',
        message: 'Failed to submit report. Please try again.'
      });
    }
  };

  const handleCloseSuccess = () => {
    setSuccessModalVisible(false);
    setStep(1);
    setDetailsText('');
    setIsAnonymous(false);
    setSelectedType('security');
    setMediaFiles([]);
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
            color={step > 1 ? '#00875A' : colors.text.primary} 
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
        <View style={styles.headerRight} />
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
            const activeBgColor = isDark ? cat.darkBgColor : cat.bgColor;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.card,
                  isSelected && {
                    borderColor: cat.color,
                    backgroundColor: activeBgColor,
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
                <View style={[styles.iconCircle, { backgroundColor: isSelected ? colors.white : activeBgColor }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={32} color={cat.color} />
                </View>
                <Text style={[styles.cardLabel, isSelected && { color: isDark ? colors.text.primary : cat.color }]}>{cat.label}</Text>
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
          onPress={async () => {
            setStep(2);
            // Fetch location when entering step 2
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              setAddress('Location permission denied');
              return;
            }
            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation(loc);
            
            try {
              let geocode = await Location.reverseGeocodeAsync(loc.coords);
              if (geocode && geocode.length > 0) {
                const place = geocode[0];
                
                let primaryName = place.street;
                if (!primaryName && place.name && !place.name.includes('+')) {
                  primaryName = place.name;
                }
                if (!primaryName) {
                  primaryName = place.district || 'Unnamed Road';
                }

                const formattedAddress = `${place.streetNumber ? place.streetNumber + ' ' : ''}${primaryName}, ${place.city || place.subregion || place.region}`;
                setAddress(formattedAddress);
              } else {
                setAddress('Location found, address unknown');
              }
            } catch (e) {
              setAddress('Location found');
            }
          }}
        >
          <Text style={styles.nextButtonText}>Next: Add Location</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.step2Container}>
        <Text style={styles.titleLeft}>Where is this happening?</Text>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.text.secondary} />
          <TextInput 
            style={styles.searchInput}
            value={address}
            onChangeText={setAddress}
            placeholder="Enter address manually..."
            placeholderTextColor={colors.text.secondary}
            returnKeyType="search"
            onSubmitEditing={async () => {
              if (address.trim().length > 3) {
                try {
                  const geocodeResult = await Location.geocodeAsync(address);
                  if (geocodeResult && geocodeResult.length > 0) {
                    const { latitude, longitude } = geocodeResult[0];
                    setLocation(prev => prev ? {
                      ...prev,
                      coords: {
                        ...prev.coords,
                        latitude,
                        longitude
                      }
                    } : null);
                    mapRef.current?.animateToRegion({
                      latitude,
                      longitude,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    }, 500);
                  }
                } catch (e) {
                  // Geocoding failed, leave as is
                }
              }
            }}
          />
          {address.length > 0 && (
            <TouchableOpacity onPress={() => setAddress('')}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.mapContainer, { overflow: 'hidden' }]}>
          {location ? (
            <MapView
              ref={mapRef}
              style={{ width: '100%', height: '100%' }}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              showsUserLocation={true}
              onRegionChangeComplete={handleRegionChangeComplete}
            />
          ) : (
            <View style={[styles.mapMockBg, { justifyContent: 'center', alignItems: 'center' }]}>
               <ActivityIndicator color={colors.primary} />
            </View>
          )}

          {/* Center Map Pin Overlay */}
          <View style={styles.mapPinContainer} pointerEvents="none">
            <View style={styles.mapPinRing}>
              <View style={styles.mapPinCenter} />
            </View>
          </View>

          {/* Use Current Location Button */}
          <TouchableOpacity 
            style={styles.currentLocationBtn} 
            activeOpacity={0.8}
            onPress={async () => {
              try {
                let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                mapRef.current?.animateToRegion({
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }, 500);
              } catch (e) {
                // Ignore error if location fetch fails
              }
            }}
          >
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
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
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
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.5} onPress={handleTakePhoto}>
            <Ionicons name="camera-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.5} onPress={handleRecordVideo}>
            <Ionicons name="videocam-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.5} onPress={startRecording}>
            <Ionicons name="mic-outline" size={28} color="#00875A" />
            <Text style={styles.mediaCardText}>Record Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaCard} activeOpacity={0.5} onPress={handlePickLibrary}>
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
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedPreview(uri)}>
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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

        <ConfirmationModal
          visible={errorModal.visible}
          title={errorModal.title}
          message={errorModal.message}
          iconName="alert-circle"
          iconColor="#EF4444"
          onClose={() => setErrorModal({ ...errorModal, visible: false })}
        />

        {/* Media Preview Modal */}
        <Modal
          visible={selectedPreview !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedPreview(null)}
        >
          <View style={styles.previewModalOverlay}>
            <TouchableOpacity 
              style={styles.previewCloseBtn} 
              onPress={() => setSelectedPreview(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>

            {selectedPreview && (selectedPreview.endsWith('.mp4') || selectedPreview.endsWith('.mov') || selectedPreview.includes('video') || selectedPreview.endsWith('.m4a') || selectedPreview.endsWith('.caf') || selectedPreview.includes('audio') || selectedPreview.includes('recording')) ? (
              <View style={styles.audioPreviewWrapper}>
                {(selectedPreview.endsWith('.m4a') || selectedPreview.endsWith('.caf') || selectedPreview.includes('audio') || selectedPreview.includes('recording')) && (
                  <Ionicons name="musical-notes" size={80} color="#FFF" style={styles.audioPreviewIcon} />
                )}
                <Video
                  source={{ uri: selectedPreview }}
                  style={styles.fullScreenPreview}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                />
              </View>
            ) : (
              <Image 
                source={{ uri: selectedPreview || undefined }} 
                style={styles.fullScreenPreview} 
                resizeMode="contain" 
              />
            )}
          </View>
        </Modal>

        {/* Audio Recording Modal */}
        <Modal
          visible={recording !== null}
          transparent={true}
          animationType="slide"
          onRequestClose={stopRecording}
        >
          <View style={styles.recordingOverlay}>
            <View style={styles.recordingCard}>
              <Animated.View style={[styles.recordingPulse, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="mic" size={40} color="#EF4444" />
              </Animated.View>
              <Text style={styles.recordingText}>Recording Audio...</Text>
              
              <TouchableOpacity style={styles.stopRecordingBtn} onPress={stopRecording} activeOpacity={0.7}>
                <View style={styles.stopIcon} />
                <Text style={styles.stopRecordingText}>Stop Recording</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
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
    color: colors.text.primary,
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
    backgroundColor: colors.border,
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
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  subtitleCentered: {
    fontSize: 15,
    color: colors.text.secondary,
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
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
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
    color: colors.text.primary,
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
    color: colors.text.primary,
    marginBottom: 12,
  },
  subtitleLeft: {
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '500',
    marginHorizontal: 12,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
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
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: colors.white,
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
    color: colors.text.primary,
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
    marginTop: 8, // Give space so the absolute X button at -6 isn't clipped
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
  videoOverlayIcon: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPreviewWrapper: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPreviewIcon: {
    position: 'absolute',
    zIndex: 0,
    opacity: 0.5,
  },
  fullScreenPreview: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  recordingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  recordingCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    alignItems: 'center',
    ...Shadows.md,
  },
  recordingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  recordingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 24,
  },
  stopRecordingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    ...Shadows.sm,
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: '#FFF',
    borderRadius: 3,
    marginRight: 10,
  },
  stopRecordingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
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
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
