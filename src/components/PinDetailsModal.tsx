import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { formatAddress } from '../utils/location';
import type { ThemeColors } from '../constants/Theme';

export type PinData = {
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
};

interface PinDetailsModalProps {
  visible: boolean;
  pin: PinData | null;
  onClose: () => void;
}

export function PinDetailsModal({ visible, pin, onClose }: PinDetailsModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { bottom: insetsBottom } = insets;
  const styles = React.useMemo(() => getStyles(colors, insetsBottom), [colors, insetsBottom]);

  const [address, setAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Fetch human-readable address when the pin opens
  useEffect(() => {
    let isMounted = true;
    if (visible && pin) {
      setLoadingAddress(true);
      setAddress(null);
      Location.reverseGeocodeAsync({ latitude: pin.latitude, longitude: pin.longitude })
        .then((result) => {
          if (isMounted && result && result.length > 0) {
            const formatted = formatAddress(result[0]);
            setAddress(formatted);
          } else if (isMounted) {
            setAddress('Address unknown');
          }
        })
        .catch(() => {
          if (isMounted) setAddress('Address unknown');
        })
        .finally(() => {
          if (isMounted) setLoadingAddress(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, pin]);

  const handleNavigate = () => {
    if (!pin) return;
    const url = Platform.select({
      ios: `maps://app?daddr=${pin.latitude},${pin.longitude}`,
      android: `google.navigation:q=${pin.latitude},${pin.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`,
    });
    Linking.openURL(url);
    onClose();
  };

  if (!pin) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      hardwareAccelerated
    >
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheetContainer}>
        {/* Drag handle pill */}
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="location" size={24} color={colors.primary} />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {pin.title}
            </Text>
            {pin.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {pin.subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Location</Text>
          {loadingAddress ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Text style={styles.addressText}>
              {address}
            </Text>
          )}
          <Text style={styles.coordsText}>
            {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.navigateButton}
          onPress={handleNavigate}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Navigate in Google Maps"
        >
          <Ionicons name="navigate" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.navigateButtonText}>Navigate in Google Maps</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors, insetsBottom: number) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Math.max(insetsBottom + 24, 24),
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  addressContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 24,
    marginBottom: 8,
  },
  coordsText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  navigateButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
