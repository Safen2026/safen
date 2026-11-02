import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { firebaseAuth } from '../src/lib/firebase';
import { PhoneAuthProvider, signInWithCredential, signInWithPhoneNumber, updateProfile } from '@react-native-firebase/auth';
import { supabase } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';
import { getSignupData } from '../src/utils/signupStore';
import { checkNeedsPermissionsOnboarding } from '../src/utils/permissionUtils';
import { customAlert } from '../src/utils/customAlert';
import { showToast } from '../src/utils/toast';

const BRAND_BLUE = '#0A2463';
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  
  const { verificationId: initialVerificationId } = useLocalSearchParams<{ verificationId: string }>();
  const { phone = '', firstName, lastName, email } = getSignupData();

  const [verificationId, setVerificationId] = useState(initialVerificationId);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOtpChange = useCallback((text: string, index: number) => {
    // Handle paste (user pastes full 6-digit code)
    if (text.length === OTP_LENGTH) {
      const digits = text.split('').slice(0, OTP_LENGTH);
      setOtp(digits);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    const digit = text.replace(/\D/g, '').slice(-1);
    setOtp(prev => {
      const newOtp = [...prev];
      newOtp[index] = digit;
      return newOtp;
    });

    // Auto-advance to next box
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyPress = useCallback((e: import('react-native').NativeSyntheticEvent<import('react-native').TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // If current box is empty, clear the previous box and move focus
        setOtp(prev => {
          const newOtp = [...prev];
          newOtp[index - 1] = '';
          return newOtp;
        });
        inputRefs.current[index - 1]?.focus();
      }
    }
  }, [otp]);

  const handleVerify = useCallback(async () => {
    const token = otp.join('');
    if (token.length < OTP_LENGTH) {
      customAlert('Incomplete Code', 'Please enter all 6 digits of the verification code.', undefined, { type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, token);
      const { user } = await signInWithCredential(firebaseAuth!, credential);
      
      if (firstName && lastName) {
        await updateProfile(user, { displayName: `${firstName} ${lastName}` });
      }
      
      // HYBRID AUTH: Synchronize Firebase phone verification securely to Supabase
      const dummyPassword = 'SafenSecurePassword2026!';
      
      // Try signing in
      let { error: sbError } = await supabase.auth.signInWithPassword({
        phone: user.phoneNumber as string,
        password: dummyPassword
      });
      
      // If user doesn't exist in Supabase yet, sign them up!
      if (sbError?.message.includes('Invalid login credentials')) {
        if (!firstName || !lastName) {
          setLoading(false);
          customAlert(
            'Account Not Found',
            'This phone number is not registered. Please go back and select Create Account.',
            [{ text: 'Go Back', onPress: () => router.back() }],
            { type: 'warning' }
          );
          // Sign out of Firebase so they can restart fresh
          await firebaseAuth?.signOut();
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({
          phone: user.phoneNumber as string,
          password: dummyPassword,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`,
              first_name: firstName,
              last_name: lastName
            }
          }
        });

        if (signUpError) {
          setLoading(false);
          customAlert('Registration Error', signUpError.message, undefined, { type: 'error' });
          await firebaseAuth?.signOut();
          return;
        }
      } else if (!sbError) {
        // The sign in succeeded, meaning the account ALREADY exists
        // If they provided firstName and lastName, they are in the SIGN UP flow
        if (firstName && lastName) {
          setLoading(false);
          customAlert(
            'Account Already Exists',
            'This phone number is already registered to an account. Please go back and select Sign In instead.',
            [{ text: 'Go to Sign In', onPress: () => router.back() }],
            { type: 'info' }
          );
          await firebaseAuth?.signOut();
          await supabase.auth.signOut();
          return;
        }
      } else if (sbError?.message.includes('Phone not confirmed')) {
        setLoading(false);
        customAlert(
          'Account Notice',
          'This phone number requires verification setting adjustments. Please check your account settings or contact support.',
          undefined,
          { type: 'error' }
        );
        return;
      } else if (sbError) {
        setLoading(false);
        customAlert('Authentication Error', sbError.message, undefined, { type: 'error' });
        return;
      }
      
      setLoading(false);
      // Verify real OS permission state (fixes Android Auto Backup reinstall skip)
      const needsOnboarding = await checkNeedsPermissionsOnboarding();
      router.replace(needsOnboarding ? '/permissions' : '/(tabs)');
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      customAlert('Verification Failed', msg, undefined, { type: 'error' });
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  }, [otp, verificationId, firstName, lastName]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const confirmation = await signInWithPhoneNumber(firebaseAuth!, phone);
      const newVerificationId = confirmation.verificationId;
      setVerificationId(newVerificationId);
      setLoading(false);
      setResendCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      showToast({ title: 'Code Sent', subtitle: 'A new verification code has been sent to your phone.', icon: 'checkmark-circle' });
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      customAlert('Resend Failed', msg, undefined, { type: 'error' });
    }
  }, [resendCooldown, phone]);

  const maskedPhone = phone ? `${phone.slice(0, 6)}****${phone.slice(-3)}` : '';

  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Back button */}
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={{ width: '100%', alignItems: 'center' }}>
            {/* Icon */}
            <View style={styles.iconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={BRAND_BLUE} />
            </View>

            <Text style={[styles.title, { color: colors.text.primary }]} accessibilityRole="header">Verify your number</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              We sent a 6-digit code to{'\n'}
              <Text style={[styles.phone, { color: colors.text.primary }]}>{maskedPhone}</Text>
            </Text>

            {/* OTP boxes */}
            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.otpBox, 
                    { color: colors.text.primary, borderColor: colors.border, backgroundColor: colors.white },
                    digit ? styles.otpBoxFilled : null
                  ]}
                  value={digit}
                  onChangeText={text => handleOtpChange(text, index)}
                  onKeyPress={e => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  autoFocus={index === 0}
                  accessibilityLabel={`OTP digit ${index + 1}`}
                />
              ))}
            </View>

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.cta, (loading || otp.join('').length < OTP_LENGTH) && styles.ctaDisabled]}
              activeOpacity={0.85}
              onPress={handleVerify}
              disabled={loading || otp.join('').length < OTP_LENGTH}
              accessibilityRole="button"
              accessibilityLabel="Verify and Continue"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={[styles.resendLabel, { color: colors.text.secondary }]}>Didn&apos;t receive a code? </Text>
              <TouchableOpacity 
                onPress={handleResend} 
                disabled={resendCooldown > 0 || loading}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                <Text style={[styles.resendBtn, resendCooldown > 0 && { color: colors.text.secondary }]}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (colors: import('../src/constants/Theme').ThemeColors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: 24, alignItems: 'flex-start' },
  backBtn: { padding: 4, marginBottom: 20 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND_BLUE + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
  phone: { fontWeight: '700' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 32, paddingHorizontal: 10 },
  otpBox: { width: 45, height: 55, borderWidth: 1.5, borderRadius: 12, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  otpBoxFilled: { borderColor: BRAND_BLUE, backgroundColor: BRAND_BLUE + '08' },
  cta: { backgroundColor: BRAND_BLUE, width: '100%', height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: BRAND_BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  resendLabel: { fontSize: 14 },
  resendBtn: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE },
});
