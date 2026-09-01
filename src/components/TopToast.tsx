import React, { useRef } from 'react';
import { Animated, View, Text, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export interface TopToastRef {
  show: (options: { title: string; subtitle?: string; icon?: any; duration?: number }) => void;
}

export const TopToast = React.memo(React.forwardRef<TopToastRef>((_, ref) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toastAnim = useRef(new Animated.Value(-150)).current;

  const [config, setConfig] = React.useState<{
    title: string;
    subtitle?: string;
    icon?: any;
    duration: number;
  }>({
    title: '',
    icon: 'checkmark-circle',
    duration: 3500,
  });

  React.useImperativeHandle(ref, () => ({
    show: (options) => {
      setConfig({
        title: options.title,
        subtitle: options.subtitle,
        icon: options.icon || 'checkmark-circle',
        duration: options.duration || 3500,
      });

      toastAnim.setValue(-150);
      Animated.sequence([
        Animated.spring(toastAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.delay(options.duration || 3500),
        Animated.timing(toastAnim, {
          toValue: -150,
          duration: 350,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }),
      ]).start(() => {
        setConfig((prev) => ({ ...prev, title: '' }));
      });
    }
  }));

  // If there's no title, don't render anything
  if (!config.title) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastContainer,
        {
          backgroundColor: colors.background === '#F8F9FA' ? '#D1D5DB' : colors.white,
          borderColor: colors.background === '#F8F9FA' ? '#9CA3AF' : colors.border,
          shadowColor: colors.status.safeText,
          top: Math.max(insets.top, 20) + 10,
          transform: [{ translateY: toastAnim }],
          zIndex: 9999,
        },
      ]}
    >
      <View style={[styles.toastIconBg, { backgroundColor: colors.status.safeBackground }]}>
        <Ionicons name={config.icon as any} size={22} color={colors.status.safeText} />
      </View>
      <View style={styles.toastTextCol}>
        <Text style={[styles.toastTitle, { color: colors.text.primary }]}>{config.title}</Text>
        {!!config.subtitle && (
          <Text style={[styles.toastSub, { color: colors.text.secondary }]}>{config.subtitle}</Text>
        )}
      </View>
    </Animated.View>
  );
}));

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  toastIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toastTextCol: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  toastSub: {
    fontSize: 13,
    marginTop: 2,
  },
});
