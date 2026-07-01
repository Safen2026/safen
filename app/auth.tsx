import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

const Colors = {
  primary: '#0A2463',
  primaryLight: '#E8EDF7',
  background: '#F8F9FA',
  white: '#FFFFFF',
  text: { primary: '#0A2463', secondary: '#6B7280', inverse: '#FFFFFF' },
  border: '#E5E7EB',
  borderFocus: '#0A2463',
  status: { safeText: '#1B5E20' },
};

const Shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
};

type Mode = 'login' | 'signup';

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  icon: React.ReactNode;
}

const InputField: React.FC<InputFieldProps> = ({
  label, placeholder, value, onChangeText,
  secureTextEntry = false, keyboardType = 'default',
  autoCapitalize = 'none', icon,
}) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry);
  return (
    <View style={inputStyles.wrapper}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={[inputStyles.row, focused && inputStyles.rowFocused]}>
        <View style={inputStyles.iconSlot}>{icon}</View>
        <TextInput
          style={inputStyles.input}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.secondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={() => setHidden(h => !h)} style={inputStyles.eyeSlot} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text.primary, marginBottom: 6, letterSpacing: 0.1 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, height: 52, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  rowFocused: { borderColor: Colors.borderFocus },
  iconSlot: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: Colors.text.primary },
  eyeSlot: { marginLeft: 8 },
});

// Normalises Nigerian phone number to E.164 format (+234...)
const toE164Nigeria = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return `+234${digits}`;
};

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  // Login
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const underlineX = useRef(new Animated.Value(0)).current;

  const switchMode = (next: Mode) => {
    Animated.spring(underlineX, { toValue: next === 'login' ? 0 : 1, useNativeDriver: false, tension: 80, friction: 10 }).start();
    setMode(next);
  };

  const handleSignUp = async () => {
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Your passwords do not match.');
      return;
    }
    const formattedPhone = toE164Nigeria(phone);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      phone: formattedPhone,
      password,
      options: { data: { full_name: fullName, email } },
    });
    setLoading(false);
    if (error) { Alert.alert('Sign up failed', error.message); return; }
    router.push({ pathname: '/verify', params: { phone: formattedPhone, fullName, email } });
  };

  const handleLogIn = async () => {
    if (!loginPhone || !loginPassword) {
      Alert.alert('Missing fields', 'Please enter your phone number and password.');
      return;
    }
    const formattedPhone = toE164Nigeria(loginPhone);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      phone: formattedPhone,
      password: loginPassword,
    });
    setLoading(false);
    if (error) { Alert.alert('Login failed', error.message); return; }
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.brand}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Your personal safety companion</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabRow}>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode('login')}>
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode('signup')}>
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create Account</Text>
            </TouchableOpacity>
            <Animated.View style={[styles.tabUnderline, { left: underlineX.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] }) }]} />
          </View>

          <View style={styles.fields}>
            {mode === 'signup' ? (
              <>
                <InputField label="Full Name" placeholder="David Adeyemi" value={fullName} onChangeText={setFullName} autoCapitalize="words" icon={<Ionicons name="person-outline" size={18} color={Colors.text.secondary} />} />
                <InputField label="Email Address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" icon={<Ionicons name="mail-outline" size={18} color={Colors.text.secondary} />} />
                <InputField label="Phone Number" placeholder="08012345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon={<Ionicons name="call-outline" size={18} color={Colors.text.secondary} />} />
                <InputField label="Password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.text.secondary} />} />
                <InputField label="Confirm Password" placeholder="••••••••" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.text.secondary} />} />
              </>
            ) : (
              <>
                <InputField label="Phone Number" placeholder="08012345678" value={loginPhone} onChangeText={setLoginPhone} keyboardType="phone-pad" icon={<Ionicons name="call-outline" size={18} color={Colors.text.secondary} />} />
                <InputField label="Password" placeholder="••••••••" value={loginPassword} onChangeText={setLoginPassword} secureTextEntry icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.text.secondary} />} />
                <TouchableOpacity style={styles.forgotRow}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity style={[styles.cta, loading && styles.ctaDisabled]} activeOpacity={0.85} onPress={mode === 'signup' ? handleSignUp : handleLogIn} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.ctaText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn}>
              <MaterialCommunityIcons name="google" size={20} color="#DB4437" />
              <Text style={styles.socialBtnText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <MaterialCommunityIcons name="apple" size={20} color={Colors.text.primary} />
              <Text style={styles.socialBtnText}>Apple</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.notice}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={Colors.status.safeText} />
          <Text style={styles.noticeText}>Your data is encrypted and never shared with third parties.</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 180, height: 120, marginBottom: 8 },
  tagline: { marginTop: 4, fontSize: 14, color: Colors.text.secondary, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 24, position: 'relative' },
  tab: { flex: 1, paddingBottom: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600', color: Colors.text.secondary },
  tabTextActive: { color: Colors.primary },
  tabUnderline: { position: 'absolute', bottom: -1, width: '50%', height: 2, borderRadius: 2, backgroundColor: Colors.primary },
  fields: { marginBottom: 8 },
  forgotRow: { alignSelf: 'flex-end', marginTop: -6, marginBottom: 8 },
  forgotText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  cta: { backgroundColor: Colors.primary, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  socialBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 6 },
  noticeText: { fontSize: 12, color: Colors.text.secondary, flexShrink: 1, lineHeight: 18 },
});