import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/Theme';

type SnapshotListProps = {
  images: string[];
  label: string;
  onExpand: (url: string) => void;
};

const SnapshotListComponent = ({
  images, label, onExpand,
}: SnapshotListProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (images.length === 0) return null;
  
  return (
    <View style={styles.mediaGroup}>
      <Text style={styles.mediaGroupLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
        {images.map((uri, i) => (
          <TouchableOpacity
            key={`img-${i}`}
            activeOpacity={0.8}
            onPress={() => onExpand(uri)}
            accessibilityRole="button"
            accessibilityLabel={`View snapshot ${i + 1} of ${images.length}`}
            accessibilityHint="Tap to view full-size image"
          >
            <Image
              source={{ uri }}
              style={styles.thumbnail}
              resizeMode="cover"
              accessibilityLabel={`Snapshot ${i + 1}`}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export const SnapshotList = React.memo(SnapshotListComponent);
SnapshotList.displayName = 'SnapshotList';

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
  imageRow: {
    gap: 8,
  },
  thumbnail: {
    width: 112,
    height: 112,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
});
