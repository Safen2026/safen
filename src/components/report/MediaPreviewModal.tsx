import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import type { ThemeColors } from '../../constants/Theme';

interface MediaPreviewModalProps {
  selectedPreview: string | null;
  onClose: () => void;
  colors: ThemeColors;
}

export const MediaPreviewModal = React.memo(function MediaPreviewModal({
  selectedPreview,
  onClose,
  colors
}: MediaPreviewModalProps) {
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  return (
    <Modal
      visible={selectedPreview !== null}
      transparent={true}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.previewModalOverlay}>
        <TouchableOpacity 
          style={styles.previewCloseBtn} 
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Close media preview"
        >
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        {selectedPreview && (selectedPreview.endsWith('.mp4') || selectedPreview.endsWith('.mov') || selectedPreview.includes('video') || selectedPreview.endsWith('.m4a') || selectedPreview.endsWith('.caf') || selectedPreview.includes('audio') || selectedPreview.includes('recording')) ? (
          <View style={styles.audioPreviewWrapper}>
            {(selectedPreview.endsWith('.m4a') || selectedPreview.endsWith('.caf') || selectedPreview.includes('audio') || selectedPreview.includes('recording')) && (
              <Ionicons name="musical-notes" size={80} color="#FFF" style={styles.audioPreviewIcon} />
            )}
            <Video
              source={{ uri: selectedPreview }}
              style={styles.fullScreenPreview}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          </View>
        ) : selectedPreview ? (
          <Image 
            source={{ uri: selectedPreview }} 
            style={styles.fullScreenPreview} 
            resizeMode="contain" 
          />
        ) : null}
      </View>
    </Modal>
  );
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPreviewWrapper: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPreviewIcon: {
    position: 'absolute',
    zIndex: 0,
    opacity: 0.5,
  },
  fullScreenPreview: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
});
