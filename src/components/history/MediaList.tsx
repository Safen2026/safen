import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/Theme';

type MediaListProps = {
  items: string[];
  label: string;
  clipName: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onOpen: (url: string) => void;
};

const MediaListComponent = ({
  items, label, clipName, iconName, color, onOpen,
}: MediaListProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (items.length === 0) return null;
  
  return (
    <View style={styles.mediaGroup}>
      <Text style={styles.mediaGroupLabel}>{label}</Text>
      <View style={styles.mediaList}>
        {items.map((url, i) => (
          <TouchableOpacity
            key={`${clipName}-${i}`}
            style={styles.mediaFileRow}
            onPress={() => onOpen(url)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Play ${clipName} ${i + 1}`}
            accessibilityHint="Opens media file for playback"
          >
            <View style={[styles.mediaFileIcon, { backgroundColor: color + '18' }]}>
              <Ionicons name={iconName} size={20} color={color} />
            </View>
            <View style={styles.mediaFileInfo}>
              <Text style={styles.mediaFileName}>{clipName} {i + 1}</Text>
              <Text style={styles.mediaFileHint}>Tap to play</Text>
            </View>
            <Ionicons name="play-circle-outline" size={24} color={color} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export const MediaList = React.memo(MediaListComponent);
MediaList.displayName = 'MediaList';

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  mediaGroup: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border + '80',
  },
  mediaGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 10,
  },
  mediaList: {
    gap: 8,
  },
  mediaFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
  },
  mediaFileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaFileInfo: {
    flex: 1,
  },
  mediaFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  mediaFileHint: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
