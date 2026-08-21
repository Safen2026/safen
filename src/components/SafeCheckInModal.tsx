import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { formatDurationVerbose, formatArrivalDeadline } from '../utils/dateUtils';

// Import newly created subcomponents
import { DestinationSection } from './safe-check-in/DestinationSection';
import { DurationSection } from './safe-check-in/DurationSection';
import { WatchdogSection } from './safe-check-in/WatchdogSection';

interface SafeCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onStartCheckIn?: (data: { destination: string; durationMinutes: number; notifyContacts: boolean }) => void;
  initialSession?: { destination: string; notifyContacts: boolean } | null;
}

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
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  useEffect(() => {
    if (visible) {
      if (initialSession) {
        setDestination(initialSession.destination);
        setSelectedDuration(30);
        setIsCustomMode(false);
      } else {
        setDestination('');
        setSelectedDuration(30);
        setIsCustomMode(false);
        setCustomMinutes(90);
      }
    }
  }, [visible, initialSession]);

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

  const effectiveMinutes = isCustomMode ? customMinutes : selectedDuration;
  const isFormValid = destination.trim().length > 0 && effectiveMinutes > 0;

  const formattedDuration = useMemo(() => formatDurationVerbose(effectiveMinutes), [effectiveMinutes]);
  const deadlineStr = useMemo(() => formatArrivalDeadline(effectiveMinutes), [effectiveMinutes]);

  const handleStart = useCallback(() => {
    if (!isFormValid) return;
    onStartCheckIn?.({
      destination: destination.trim(),
      durationMinutes: effectiveMinutes,
      notifyContacts: true,
    });
    onClose();
  }, [isFormValid, destination, effectiveMinutes, onStartCheckIn, onClose]);

  const adjustCustom = useCallback((delta: number) => {
    setCustomMinutes(prev => Math.max(1, Math.min(43200, prev + delta)));
  }, []);

  const handleTimePicked = useCallback((event: import('@react-native-community/datetimepicker').DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setPickerMode(null);
      return;
    }
    
    if (selectedDate) {
      if (Platform.OS === 'android' && pickerMode === 'date') {
        setTempDate(selectedDate);
        setPickerMode('time');
      } else {
        let finalDate = selectedDate;
        
        if (Platform.OS === 'android' && pickerMode === 'time') {
          finalDate = new Date(tempDate);
          finalDate.setHours(selectedDate.getHours());
          finalDate.setMinutes(selectedDate.getMinutes());
        }
        
        setPickerMode(Platform.OS === 'ios' ? 'datetime' : null); 
        if (Platform.OS !== 'ios') {
          setPickerMode(null); 
        }
        
        const now = new Date();
        let diffMs = finalDate.getTime() - now.getTime();
        
        if (diffMs <= 0) diffMs = 60000; 

        const diffMins = Math.round(diffMs / 60000);
        setCustomMinutes(Math.max(1, Math.min(43200, diffMins)));
      }
    } else {
      setPickerMode(null);
    }
  }, [pickerMode, tempDate]);

  const openPicker = useCallback(() => {
    setTempDate(new Date(Date.now() + effectiveMinutes * 60 * 1000));
    setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date');
  }, [effectiveMinutes]);

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

        <View style={[styles.header, { paddingTop: topInset + 12 }]} accessible={true} accessibilityRole="header">
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: `${colors.text.secondary}1A` }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Safe Check-In"
          >
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Safe Check-In</Text>
          <View style={styles.headerRightBadge} aria-hidden={true}>
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
          <View style={[styles.heroCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]} accessible={true} accessibilityRole="text">
            <View style={styles.heroIconBox} aria-hidden={true}>
              <MaterialCommunityIcons name="timer-sand" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.text.primary }]}>Safety Watchdog Timer</Text>
              <Text style={[styles.heroSub, { color: colors.text.secondary }]}>
                Set your destination and expected arrival. If you don't check in on time, Safen automatically alerts your circle.
              </Text>
            </View>
          </View>

          <DestinationSection 
            destination={destination} 
            setDestination={setDestination} 
            colors={colors} 
          />

          <DurationSection 
            isCustomMode={isCustomMode}
            setIsCustomMode={setIsCustomMode}
            selectedDuration={selectedDuration}
            setSelectedDuration={setSelectedDuration}
            customMinutes={customMinutes}
            adjustCustom={adjustCustom}
            formattedDuration={formattedDuration}
            openPicker={openPicker}
            colors={colors}
          />

          <WatchdogSection 
            deadlineStr={deadlineStr}
            initialSession={!!initialSession}
            colors={colors}
          />

          <View style={styles.actionArea}>
            {!isFormValid && (
              <Text style={[styles.validationHint, { color: colors.text.secondary }]} accessibilityRole="alert" aria-live="polite">
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
              accessibilityRole="button"
              accessibilityLabel={initialSession ? 'Update Timer' : 'Start Check-In'}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={isFormValid ? '#fff' : colors.text.secondary}
                style={{ marginRight: 8 }}
                aria-hidden={true}
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
    actionArea: {
      marginTop: 32,
      alignItems: 'center',
    },
    validationHint: {
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 16,
    },
    primaryBtn: {
      flexDirection: 'row',
      width: '100%',
      height: 54,
      borderRadius: 27,
      justifyContent: 'center',
      alignItems: 'center',
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
