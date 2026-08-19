import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { firebaseAuth } from '../src/lib/firebase';
import { signInWithPhoneNumber } from '@react-native-firebase/auth';
import { useTheme } from '../src/context/ThemeContext';
import { setSignupData } from '../src/utils/signupStore';
import { InputField } from '../src/components/auth/InputField';
import { isValidPhone, toE164Nigeria } from '../src/utils/contactUtils';

type Mode = 'login' | 'signup';


export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  // Login
  const [loginPhone, setLoginPhone] = useState('');

  // Signup
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const underlineX = useRef(new Animated.Value(0)).current;

  const switchMode = useCallback((next: Mode) => {
    Animated.spring(underlineX, { 
      toValue: next === 'login' ? 0 : 1, 
      useNativeDriver: false, 
      tension: 80, 
      friction: 10 
    }).start();
    setMode(next);
  }, [underlineX]);

  const handleAuth = useCallback(async () => {
    const targetPhone = mode === 'signup' ? phone.trim() : loginPhone.trim();
    if (!targetPhone) {
      Alert.alert('Missing fields', 'Please enter your phone number.');
      return;
    }
    
    // Application-layer DoS protection
    if (targetPhone.length > 15) {
      Alert.alert('Error', 'Phone number is too long.');
      return;
    }
    
    if (mode === 'signup') {
      const fName = firstName.trim();
      const lName = lastName.trim();
      const mail = email.trim();
      
      if (!fName || !lName || !mail) {
        Alert.alert('Missing fields', 'Please fill in your first name, last name, and email.');
        return;
      }
      if (fName.length > 50 || lName.length > 50) {
        Alert.alert('Error', 'Name fields cannot exceed 50 characters.');
        return;
      }
      if (mail.length > 100) {
        Alert.alert('Error', 'Email cannot exceed 100 characters.');
        return;
      }
    }

    if (!isValidPhone(targetPhone)) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }

    const formattedPhone = toE164Nigeria(targetPhone);

    setLoading(true);
    try {
      if (mode === 'signup') {
        setSignupData({
          firstName,
          lastName,
          email,
          phone: formattedPhone
        });
      } else {
        setSignupData({ phone: formattedPhone });
      }

      // The Native SDK handles reCAPTCHA / Play Integrity silently in the background
      const confirmation = await signInWithPhoneNumber(firebaseAuth!, formattedPhone);
      const verificationId = confirmation.verificationId;
      setLoading(false);
      router.push({ 
        pathname: '/verify', 
        params: { verificationId } 
      });
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Authentication failed', msg);
    }
  }, [mode, phone, loginPhone, firstName, lastName, email]);

  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.brand, { marginTop: insets.top + 24 }]}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Your personal safety companion</Text>
        </View>

      <ScrollView 
        style={styles.flex} 
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.tabRow} accessibilityRole="tablist">
            <TouchableOpacity 
              style={styles.tab} 
              onPress={() => switchMode('login')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'login' }}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.tab} 
              onPress={() => switchMode('signup')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signup' }}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create Account</Text>
            </TouchableOpacity>
            <Animated.View style={[styles.tabUnderline, { left: underlineX.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] }) }]} />
          </View>

          <View style={styles.fields}>
            {mode === 'signup' ? (
              <>
                <InputField 
                  label="First Name" 
                  placeholder="David" 
                  value={firstName} 
                  onChangeText={setFirstName} 
                  autoCapitalize="words" 
                  maxLength={50}
                  icon={<Ionicons name="person-outline" size={18} color={colors.text.secondary} />} 
                />
                <InputField 
                  label="Last Name" 
                  placeholder="Adeyemi" 
                  value={lastName} 
                  onChangeText={setLastName} 
                  autoCapitalize="words" 
                  maxLength={50}
                  icon={<Ionicons name="people-outline" size={18} color={colors.text.secondary} />} 
                />
                <InputField 
                  label="Email Address" 
                  placeholder="you@example.com" 
                  value={email} 
                  onChangeText={setEmail} 
                  keyboardType="email-address" 
                  maxLength={100}
                  icon={<Ionicons name="mail-outline" size={18} color={colors.text.secondary} />} 
                />
                <InputField 
                  label="Phone Number" 
                  placeholder="08012345678" 
                  value={phone} 
                  onChangeText={setPhone} 
                  keyboardType="phone-pad" 
                  maxLength={15}
                  icon={<Ionicons name="call-outline" size={18} color={colors.text.secondary} />} 
                />
              </>
            ) : (
              <>
                <InputField 
                  label="Phone Number" 
                  placeholder="08012345678" 
                  value={loginPhone} 
                  onChangeText={setLoginPhone} 
                  keyboardType="phone-pad" 
                  maxLength={15}
                  icon={<Ionicons name="call-outline" size={18} color={colors.text.secondary} />} 
                />
              </>
            )}
          </View>

          <TouchableOpacity 
            style={[styles.cta, loading && styles.ctaDisabled]} 
            activeOpacity={0.85} 
            onPress={handleAuth} 
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={mode === 'login' ? 'Sign In button' : 'Create Account button'}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>}
          </TouchableOpacity>

        </View>

        <View style={styles.notice}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color="#1B5E20" />
          <Text style={styles.noticeText}>Your data is encrypted and never shared with third parties.</Text>
        </View>

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const BRAND_BLUE = '#0A2463';

const getStyles = (colors: import('../src/constants/Theme').ThemeColors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 180, height: 120, marginBottom: 8 },
  tagline: { marginTop: 4, fontSize: 14, color: colors.text.secondary, fontWeight: '500' },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 24, position: 'relative' },
  tab: { flex: 1, paddingBottom: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  tabTextActive: { color: BRAND_BLUE },
  tabUnderline: { position: 'absolute', bottom: -1, width: '50%', height: 2, borderRadius: 2, backgroundColor: BRAND_BLUE },
  fields: { marginBottom: 8 },
  cta: { backgroundColor: BRAND_BLUE, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8, shadowColor: BRAND_BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 6 },
  noticeText: { fontSize: 12, color: colors.text.secondary, flexShrink: 1, lineHeight: 18 },
});
