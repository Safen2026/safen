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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

// ─── Design tokens (mirrors Theme.ts) ───────────────────────────────────────
const Colors = {
  primary: '#2271EE',          // Brand blue (from app icon)
  primaryLight: '#E6F4FE',
  background: '#F8F9FA',
  white: '#FFFFFF',
  text: {
    primary: '#1F2937',
    secondary: '#6B7280',
    inverse: '#FFFFFF',
  },
  border: '#E5E7EB',
  borderFocus: '#2271EE',
  status: {
    safeText: '#107C41',
  },
};

const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Reusable labelled input ─────────────────────────────────────────────────
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
      <View style={[
        inputStyles.row,
        focused && inputStyles.rowFocused,
      ]}>
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
          <TouchableOpacity
            onPress={() => setHidden(h => !h)}
            style={inputStyles.eyeSlot}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.text.secondary}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    ...Shadows.sm,
  },
  rowFocused: {
    borderColor: Colors.borderFocus,
  },
  iconSlot: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text.primary,
  },
  eyeSlot: {
    marginLeft: 8,
  },
});

// ─── Main auth screen ─────────────────────────────────────────────────────────
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Signup extras
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Tab underline animation
  const underlineX = useRef(new Animated.Value(0)).current;

  const switchMode = (next: Mode) => {
    Animated.spring(underlineX, {
      toValue: next === 'login' ? 0 : 1,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    setMode(next);
  };

  const handleSubmit = () => {
    if (mode === 'login') {
      if (!email || !password) {
        Alert.alert('Missing fields', 'Please enter your email and password.');
        return;
      }
    } else {
      if (!fullName || !email || !phone || !password || !confirmPassword) {
        Alert.alert('Missing fields', 'Please fill in all fields.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Password mismatch', 'Your passwords do not match.');
        return;
      }
    }

    setLoading(true);
    // Simulate network request
    setTimeout(() => {
      setLoading(false);
      router.replace('/(tabs)');
    }, 1800);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Logo + wordmark ── */}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            {/* Chevron "A" shape built from two rounded bars */}
            <View style={styles.chevronLeft} />
            <View style={styles.chevronRight} />
          </View>
          <Text style={styles.wordmark}>safen</Text>
          <Text style={styles.tagline}>Your personal safety companion</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>

          {/* Tab switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode('login')}>
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => switchMode('signup')}>
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
            <Animated.View style={[
              styles.tabUnderline,
              {
                left: underlineX.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '50%'],
                }),
              },
            ]} />
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            {mode === 'signup' && (
              <InputField
                label="Full Name"
                placeholder="David Adeyemi"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                icon={<Ionicons name="person-outline" size={18} color={Colors.text.secondary} />}
              />
            )}

            <InputField
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              icon={<Ionicons name="mail-outline" size={18} color={Colors.text.secondary} />}
            />

            {mode === 'signup' && (
              <InputField
                label="Phone Number"
                placeholder="+234 800 000 0000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                icon={<Ionicons name="call-outline" size={18} color={Colors.text.secondary} />}
              />
            )}

            <InputField
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.text.secondary} />}
            />

            {mode === 'signup' && (
              <InputField
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.text.secondary} />}
              />
            )}

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotRow}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.ctaText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social row */}
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

        {/* ── Safety notice ── */}
        <View style={styles.notice}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={Colors.status.safeText} />
          <Text style={styles.noticeText}>
            Your data is encrypted and never shared with third parties.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  // ── Brand ──────────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoMark: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  // Two rotated rounded bars forming the chevron "A" icon
  chevronLeft: {
    position: 'absolute',
    width: 10,
    height: 40,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    transform: [{ rotate: '-25deg' }, { translateX: -10 }, { translateY: 4 }],
  },
  chevronRight: {
    position: 'absolute',
    width: 10,
    height: 40,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    transform: [{ rotate: '25deg' }, { translateX: 10 }, { translateY: 4 }],
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.md,
  },

  // ── Tabs ───────────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 24,
    position: 'relative',
  },
  tab: {
    flex: 1,
    paddingBottom: 12,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    width: '50%',
    height: 2,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  // ── Fields ─────────────────────────────────────────────────────────────────
  fields: {
    marginBottom: 8,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 8,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },

  // ── CTA ────────────────────────────────────────────────────────────────────
  cta: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Divider ────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },

  // ── Social ─────────────────────────────────────────────────────────────────
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    ...Shadows.sm,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },

  // ── Notice ─────────────────────────────────────────────────────────────────
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 6,
  },
  noticeText: {
    fontSize: 12,
    color: Colors.text.secondary,
    flexShrink: 1,
    lineHeight: 18,
  },
});
