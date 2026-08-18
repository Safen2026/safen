import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Switch,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { Shadows } from '../constants/Theme';

interface SafeCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onStartCheckIn?: (data: { destination: string; durationMinutes: number; notifyContacts: boolean }) => void;
  initialSession?: { destination: string; notifyContacts: boolean } | null;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const DESTINATION_PRESETS: { label: string; icon: IoniconsName }[] = [
  { label: 'Home', icon: 'home-outline' },
  { label: 'Work', icon: 'briefcase-outline' },
  { label: 'Gym', icon: 'barbell-outline' },
  { label: 'Airport', icon: 'airplane-outline' },
];

const PRESET_DURATIONS = [
  { label: '45 min', minutes: 45 },
  { label: '1 hr', minutes: 60 },
  { label: '5 hrs', minutes: 300 },
  { label: '1 day', minutes: 1440 },
];

export const SafeCheckInModal = ({
  visible,
  onClose,
  onStartCheckIn,
  initialSession,
}: SafeCheckInModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [destination, setDestination] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(45);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(90);
  const [notifyContacts, setNotifyContacts] = useState(true);
  
  // Picker state for cross-platform date & time selection
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  // Initialize or clear fields when modal opens
  useEffect(() => {
    if (visible) {
      if (initialSession) {
        setDestination(initialSession.destination);
        setNotifyContacts(initialSession.notifyContacts);
        setSelectedDuration(30);
        setIsCustomMode(false);
      } else {
        setDestination('');
        setSelectedDuration(30);
        setIsCustomMode(false);
        setCustomMinutes(90);
        setNotifyContacts(true);
      }
    }
  }, [visible, initialSession]);

  // Keyboard tracking — most reliable approach inside a Modal on both platforms
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Effective minutes active
  const effectiveMinutes = isCustomMode ? customMinutes : selectedDuration;

  // Form is valid only when destination is filled and duration is set
  const isFormValid = destination.trim().length > 0 && effectiveMinutes > 0;

  // Format custom duration label (e.g., "1 hr 30 min", "2d 4h", or "45 min")
  const formattedDuration = useMemo(() => {
    const days = Math.floor(effectiveMinutes / (24 * 60));
    const remainingMins = effectiveMinutes % (24 * 60);
    const hrs = Math.floor(remainingMins / 60);
    const mins = remainingMins % 60;
    
    if (days > 0) {
      let str = `${days}d`;
      if (hrs > 0) str += ` ${hrs}h`;
      if (mins > 0) str += ` ${mins}m`;
      return str;
    }

    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
    return `${mins} min`;
  }, [effectiveMinutes]);

  // Compute calculated arrival deadline string (e.g. "1:45 PM" or "Tomorrow, 2:45 PM")
  const deadlineStr = useMemo(() => {
    const deadline = new Date(Date.now() + effectiveMinutes * 60 * 1000);
    const isToday = new Date().toDateString() === deadline.toDateString();
    
    const timeStr = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.toDateString() === deadline.toDateString()) {
      return `Tomorrow, ${timeStr}`;
    }
    
    const dateStr = deadline.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  }, [effectiveMinutes]);

  const handleStart = () => {
    if (!isFormValid) return;
    onStartCheckIn?.({
      destination: destination.trim(),
      durationMinutes: effectiveMinutes,
      notifyContacts,
    });
    onClose();
  };

  // +/- 1 minute by default; pass a larger delta for quick-add chips (cap at 30 days)
  const adjustCustom = (delta: number) => {
    setCustomMinutes(prev => Math.max(1, Math.min(43200, prev + delta)));
  };

  const handleTimePicked = (event: import('@react-native-community/datetimepicker').DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerMode(null);
      return;
    }
    
    if (selectedDate) {
      if (Platform.OS === 'android' && pickerMode === 'date') {
        // Android step 1: Date picked. Save it and immediately open Time picker.
        setTempDate(selectedDate);
        setPickerMode('time');
      } else {
        // Android step 2 (Time picked) OR iOS (Datetime picked)
        let finalDate = selectedDate;
        
        if (Platform.OS === 'android' && pickerMode === 'time') {
          // Combine chosen date with chosen time
          finalDate = new Date(tempDate);
          finalDate.setHours(selectedDate.getHours());
          finalDate.setMinutes(selectedDate.getMinutes());
        }
        
        setPickerMode(Platform.OS === 'ios' ? 'datetime' : null); // Keep open on iOS until manually dismissed if needed
        if (Platform.OS !== 'ios') {
          setPickerMode(null); // Close on Android
        }
        
        const now = new Date();
        let diffMs = finalDate.getTime() - now.getTime();
        
        // minimumDate prevents past dates, but just as a fallback clamp it to 1 minute
        if (diffMs <= 0) diffMs = 60000; 

        const diffMins = Math.round(diffMs / 60000);
        setCustomMinutes(Math.max(1, Math.min(43200, diffMins)));
      }
    } else {
      setPickerMode(null);
    }
  };

  const openPicker = () => {
    setTempDate(new Date(Date.now() + effectiveMinutes * 60 * 1000));
    setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date');
  };

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 24
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={colors.background === '#121212' ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: `${colors.text.secondary}1A` }]}
            onPress={onClose}
            accessibilityLabel="Close Safe Check-In"
          >
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Safe Check-In</Text>
          <View style={styles.headerRightBadge}>
            <MaterialCommunityIcons name="shield-check" size={20} color="#10B981" />
          </View>
        </View>

        {pickerMode && (
          <DateTimePicker
            value={tempDate}
            mode={pickerMode}
            is24Hour={false}
            display="default"
            minimumDate={new Date()}
            onChange={handleTimePicked}
          />
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 48, 64) + keyboardHeight },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Explainer Card */}
          <View style={[styles.heroCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
            <View style={styles.heroIconBox}>
              <MaterialCommunityIcons name="timer-sand" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.text.primary }]}>Safety Watchdog Timer</Text>
              <Text style={[styles.heroSub, { color: colors.text.secondary }]}>
                Set your destination and expected arrival. If you don't check in on time, Safen automatically alerts your circle.
              </Text>
            </View>
          </View>

          {/* Destination Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>WHERE ARE YOU HEADING?</Text>
              <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>Type or choose a preset</Text>
            </View>
            
            <View style={[styles.inputCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
              <Ionicons name="location-outline" size={20} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: colors.text.primary }]}
                placeholder="e.g. Home, Airport, Client meeting..."
                placeholderTextColor={colors.text.secondary}
                value={destination}
                onChangeText={setDestination}
              />
              {destination.length > 0 && (
                <TouchableOpacity onPress={() => setDestination('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Destination Chips — On-Screen Grid (No horizontal overflow) */}
            <View style={styles.presetsGrid}>
              {DESTINATION_PRESETS.map(preset => {
                const isSelected = destination.toLowerCase() === preset.label.toLowerCase();
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.white,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setDestination(preset.label)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={preset.icon}
                      size={16}
                      color={isSelected ? '#fff' : colors.text.primary}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.presetChipText,
                        {
                          color: isSelected ? '#fff' : colors.text.primary,
                          fontWeight: isSelected ? '700' : '600',
                        },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Duration / Arrival Time Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>EXPECTED DURATION</Text>
              <Text style={[styles.sectionHint, { color: colors.text.secondary }]}>
                {isCustomMode ? `Custom: ${formattedDuration}` : 'Select a preset or custom'}
              </Text>
            </View>

            {/* Preset chips row + Custom chip */}
            <View style={styles.durationRow}>
              {PRESET_DURATIONS.map(opt => {
                const isSelected = !isCustomMode && selectedDuration === opt.minutes;
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[
                      styles.durationCard,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.white,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setIsCustomMode(false);
                      setSelectedDuration(opt.minutes);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.durationValue,
                        {
                          color: isSelected ? '#fff' : colors.text.primary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Custom Duration Button */}
              <TouchableOpacity
                style={[
                  styles.durationCard,
                  {
                    backgroundColor: isCustomMode ? colors.primary : colors.white,
                    borderColor: isCustomMode ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setIsCustomMode(true)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.durationValue,
                    {
                      color: isCustomMode ? '#fff' : colors.text.primary,
                      fontWeight: isCustomMode ? '700' : '500',
                    },
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom Duration Inline Stepper / Adjuster Card */}
            {isCustomMode && (
              <View style={[styles.customStepperCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
                <Text style={[styles.customStepperLabel, { color: colors.text.secondary }]}>
                  SET YOUR EXACT TIME
                </Text>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: `${colors.text.secondary}15` }]}
                    onPress={() => adjustCustom(-1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove" size={20} color={colors.text.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stepperValueBox}
                    activeOpacity={0.7}
                    onPress={openPicker}
                  >
                    <Text style={[styles.stepperBigValue, { color: colors.text.primary }]}>
                      {formattedDuration}
                    </Text>
                    <Text style={[styles.stepperSubtext, { color: colors.text.secondary }]}>
                      {customMinutes} minute{customMinutes !== 1 ? 's' : ''} • Tap to pick
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: `${colors.text.secondary}15` }]}
                    onPress={() => adjustCustom(1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add" size={20} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* Quick Add Increment Chips */}
                <View style={styles.quickAddRow}>
                  {[15, 60, 1440].map(mins => (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.quickAddChip, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
                      onPress={() => adjustCustom(mins)}
                    >
                      <Text style={[styles.quickAddText, { color: colors.primary }]}>
                        +{mins === 1440 ? '1 day' : mins >= 60 ? '1 hr' : `${mins}m`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Dynamic Deadline Preview Banner */}
            <View style={[styles.deadlineContainer, { backgroundColor: colors.white, borderColor: colors.border }]}>
              <View style={styles.deadlineLeft}>
                <Ionicons name="alarm-outline" size={22} color="#10B981" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                    {initialSession ? 'Add Time' : 'Safe Check-In'}
                  </Text>
                  <Text style={[styles.deadlineSub, { color: colors.text.secondary }]}>
                    Reminder 5 mins before • Alerts contacts 5 mins after
                  </Text>
                </View>
              </View>
              <Text style={styles.deadlineBadge}>
                {deadlineStr}
              </Text>
            </View>
          </View>

          {/* Safety Circle Notification Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>WATCHDOG NOTIFICATION</Text>
            </View>

            <View style={[styles.watchdogCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
              <View style={[styles.watchdogIconWrapper, { backgroundColor: '#10B9811A' }]}>
                <Ionicons name="people" size={20} color="#10B981" />
              </View>
              <View style={styles.watchdogTextContainer}>
                <Text style={[styles.watchdogTitle, { color: colors.text.primary }]}>
                  Alert Emergency Contacts
                </Text>
                <Text style={[styles.watchdogSub, { color: colors.text.secondary }]}>
                  Sends SMS + live location if missed
                </Text>
              </View>
              <Switch
                value={notifyContacts}
                onValueChange={setNotifyContacts}
                trackColor={{ false: colors.border, true: '#10B981' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>
          </View>

          {/* CTA Action Area */}
          <View style={styles.actionArea}>
            {/* Validation hint */}
            {!isFormValid && (
              <Text style={[styles.validationHint, { color: colors.text.secondary }]}>
                {destination.trim().length === 0
                  ? '📍 Enter a destination to continue'
                  : '⏱ Select or set an expected duration'}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: isFormValid ? colors.primary : `${colors.text.secondary}30`,
                },
                isFormValid && {
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }
              ]}
              onPress={handleStart}
              activeOpacity={isFormValid ? 0.88 : 1}
              disabled={!isFormValid}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={isFormValid ? '#fff' : colors.text.secondary}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.primaryBtnText, { color: '#fff' }]}>
                {initialSession ? 'Update Timer' : 'Start Check-In'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.captionText, { color: colors.text.secondary }]}>
              Watchdog uses negligible battery in background
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    headerRightBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#10B9811A',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 18,
    },
    heroCard: {
      flexDirection: 'row',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 28,
      alignItems: 'center',
      gap: 14,
    },
    heroIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: `${colors.primary}1A`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 3,
    },
    heroSub: {
      fontSize: 12,
      lineHeight: 17,
    },
    section: {
      marginBottom: 28,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    sectionHint: {
      fontSize: 11,
    },
    inputCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      ...Shadows.sm,
    },
    inputIcon: {
      marginRight: 10,
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      height: '100%',
    },
    presetsGrid: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
      marginBottom: 8,
    },
    presetChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: 20,
      borderWidth: 1,
      ...Shadows.sm,
    },
    presetChipText: {
      fontSize: 12,
    },
    durationRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    durationCard: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      borderWidth: 1,
      ...Shadows.sm,
    },
    durationValue: {
      fontSize: 13,
    },
    customStepperCard: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 14,
      ...Shadows.sm,
    },
    customStepperLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: 12,
      textAlign: 'center',
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
    },
    stepperBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperValueBox: {
      alignItems: 'center',
    },
    stepperBigValue: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    stepperSubtext: {
      fontSize: 12,
      marginTop: 2,
    },
    quickAddRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      marginTop: 14,
    },
    quickAddChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
    },
    quickAddText: {
      fontSize: 12,
      fontWeight: '700',
    },
    deadlineContainer: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      gap: 14,
      ...Shadows.sm,
    },
    deadlineLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    deadlineTitle: {
      fontSize: 14,
      fontWeight: '700',
    },
    deadlineSub: {
      fontSize: 11,
      marginTop: 2,
    },
    deadlineBadge: {
      fontSize: 14,
      fontWeight: '800',
      color: '#10B981',
      backgroundColor: '#10B9811A',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginLeft: 34,
    },
    watchdogCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      ...Shadows.sm,
    },
    watchdogIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    watchdogTextContainer: {
      flex: 1,
    },
    watchdogTitle: {
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 2,
    },
    watchdogSub: {
      fontSize: 12,
    },
    actionArea: {
      marginTop: 32,
      alignItems: 'center',
    },
    validationHint: {
      fontSize: 12,
      textAlign: 'center',
      marginBottom: 10,
    },
    primaryBtn: {
      width: '100%',
      height: 54,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
    },
    captionText: {
      fontSize: 11,
      textAlign: 'center',
      marginTop: 12,
    },
  });
