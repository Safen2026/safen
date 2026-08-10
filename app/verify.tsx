import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import app, { firebaseAuth } from '../src/lib/firebase';
import { PhoneAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { supabase } from '../src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERMISSIONS_STORAGE_KEY } from './permissions';

const Colors = {
  primary: '#2271EE',
  background: '#F8F9FA',
  white: '#FFFFFF',
  text: { primary: '#1F2937', secondary: '#6B7280' },
  border: '#E5E7EB',
  borderFocus: '#2271EE',
  status: { safeText: '#107C41' },
};

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  const { phone, verificationId: initialVerificationId, firstName, lastName, email } = useLocalSearchParams<{ phone: string, verificationId: string, firstName?: string, lastName?: string, email?: string }>();

  const [verificationId, setVerificationId] = useState(initialVerificationId);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const recaptchaVerifier = useRef(null);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOtpChange = (text: string, index: number) => {
    // Handle paste (user pastes full 6-digit code)
    if (text.length === OTP_LENGTH) {
      const digits = text.split('').slice(0, OTP_LENGTH);
      setOtp(digits);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-advance to next box
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const token = otp.join('');
    if (token.length < OTP_LENGTH) {
      Alert.alert('Incomplete code', 'Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, token);
      const { user } = await signInWithCredential(firebaseAuth, credential);
      
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
          Alert.alert('Account not found', 'This phone number is not registered. Please go back and select Sign Up.');
          // Sign out of Firebase so they can restart fresh
          await firebaseAuth.signOut();
          return;
        }
        await supabase.auth.signUp({
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
      } else if (!sbError) {
        // The sign in succeeded, meaning the account ALREADY exists
        // If they provided firstName and lastName, they are in the SIGN UP flow
        if (firstName && lastName) {
          setLoading(false);
          Alert.alert('Account already exists', 'This phone number is already registered to an account. Please go back and select Sign In instead.');
          await firebaseAuth.signOut();
          await supabase.auth.signOut();
          return;
        }
      } else if (sbError?.message.includes('Phone not confirmed')) {
        setLoading(false);
        Alert.alert(
          'Account Stuck',
          'This phone number was registered before the confirmation setting was disabled. Please delete this user from the Supabase Authentication dashboard and try again.'
        );
        return;
      } else if (sbError) {
        setLoading(false);
        Alert.alert('Supabase Error', sbError.message);
        return;
      }
      
      setLoading(false);
      // Check if permissions onboarding was completed
      try {
        const done = await AsyncStorage.getItem(PERMISSIONS_STORAGE_KEY);
        if (done === 'true') {
          router.replace('/(tabs)');
        } else {
          router.replace('/permissions');
        }
      } catch {
        router.replace('/permissions');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Verification failed', err.message);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const phoneProvider = new PhoneAuthProvider(firebaseAuth);
      const newVerificationId = await phoneProvider.verifyPhoneNumber(
        phone,
        recaptchaVerifier.current as any
      );
      setVerificationId(newVerificationId);
      setLoading(false);
      setResendCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert('Code sent', 'A new verification code has been sent to your phone.');
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Resend failed', err.message);
    }
  };

  const maskedPhone = phone ? `${phone.slice(0, 6)}****${phone.slice(-3)}` : '';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        // @ts-ignore
        innerRef={recaptchaVerifier}
        firebaseConfig={app.options}
        attemptInvisibleVerification={true}
      />
      <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={{ width: '100%', alignItems: 'center' }}>
          {/* Icon */}
          <View style={styles.iconWrap}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color={Colors.primary} />
        </View>

        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.phone}>{maskedPhone}</Text>
        </Text>

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => { inputRefs.current[index] = ref; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={text => handleOtpChange(text, index)}
              onKeyPress={e => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              selectTextOnFocus
              autoFocus={index === 0}
            />
          ))}
        </View>

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.cta, (loading || otp.join('').length < OTP_LENGTH) && styles.ctaDisabled]}
          activeOpacity={0.85}
          onPress={handleVerify}
          disabled={loading || otp.join('').length < OTP_LENGTH}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.ctaText}>Verify & Continue</Text>
          )}
        </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn&apos;t receive a code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={resendCooldown > 0 || loading}>
              <Text style={[styles.resendBtn, resendCooldown > 0 && styles.resendBtnDisabled]}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, paddingHorizontal: 24 },

  backBtn: {
    alignSelf: 'flex-start',
    padding: 8,
    marginLeft: -8,
    marginBottom: 32,
  },

  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#E6F4FE',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
  },

  title: {
    fontSize: 26, fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15, color: Colors.text.secondary,
    textAlign: 'center', lineHeight: 22, marginBottom: 40,
  },
  phone: { fontWeight: '700', color: Colors.text.primary },

  otpRow: {
    flexDirection: 'row', gap: 10,
    marginBottom: 36,
  },
  otpBox: {
    width: 48, height: 56,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.white,
    textAlign: 'center',
    fontSize: 22, fontWeight: '700',
    color: Colors.text.primary,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: '#E6F4FE',
  },

  cta: {
    width: '100%', height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
    marginBottom: 20,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendLabel: { fontSize: 14, color: Colors.text.secondary },
  resendBtn: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  resendBtnDisabled: { color: Colors.text.secondary },
});