import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/Theme';
import { useSession } from '../context/SessionContext';
import { useAvatar } from '../hooks/useAvatar';
import { Avatar } from './Avatar';
import { AvatarPickerModal } from './AvatarPickerModal';
import { getUserDisplayName } from '../utils/userUtils';

export const WelcomeCard = React.memo(() => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const session = useSession();
  const { avatarUrl, uploading, uploadAvatar } = useAvatar();

  const [pickerVisible, setPickerVisible] = useState(false);

  const fullName = getUserDisplayName(session?.user);
  const firstName = fullName === 'A Safen user' ? 'User' : fullName.split(' ')[0];

  const openPicker = useCallback(() => setPickerVisible(true), []);
  const closePicker = useCallback(() => setPickerVisible(false), []);

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={openPicker}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Update profile picture"
      >
        {/* Avatar row */}
        <View style={styles.topRow}>
          <View style={styles.avatarWrap}>
            <Avatar name={fullName} avatarUrl={avatarUrl} isLoading={uploading} size={52} />
            {!uploading && (
              <View style={[styles.cameraBadge, { backgroundColor: '#E02B2B', borderColor: colors.white }]}>
                <Ionicons name="camera" size={9} color="#fff" />
              </View>
            )}
          </View>

          {/* Greeting */}
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <Text style={[styles.greeting, { color: colors.text.secondary }]}>Welcome back,</Text>
              <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{firstName}</Text>
            </View>
          </View>
        </View>

        {/* Member badge & photo action indicator */}
        <View style={styles.badgeRow}>
          <View style={styles.premiumBadge}>
            <Ionicons name="star" size={10} color="#F59E0B" />
            <Text style={styles.premiumText}>Member</Text>
          </View>
          <Ionicons name="camera-outline" size={18} color={colors.text.secondary} />
        </View>
      </TouchableOpacity>

      {/* Avatar picker bottom sheet */}
      <AvatarPickerModal
        visible={pickerVisible}
        onClose={closePicker}
        onUpload={uploadAvatar}
      />
    </>
  );
});

WelcomeCard.displayName = 'WelcomeCard';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  greetingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingText: {
    flex: 1,
  },
  greeting: {
    fontSize: 12,
    marginBottom: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F59E0B40',
  },
  premiumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
});
