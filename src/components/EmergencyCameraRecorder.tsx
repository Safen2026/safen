import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView } from 'expo-camera';

interface EmergencyCameraRecorderProps {
  onCameraReady?: (cameraRef: CameraView | null) => void;
}

export const EmergencyCameraRecorder: React.FC<EmergencyCameraRecorderProps> = ({
  onCameraReady,
}) => {
  const cameraRef = useRef<CameraView | null>(null);

  return (
    // The camera MUST render at a real size for the Android GPU compositor
    // to actually capture frames. Using opacity:0 or a 1×1 view causes the
    // compositor to skip rendering, producing an all-black recording.
    // We position it 400px off the bottom-right edge — rendered but invisible.
    <View style={styles.offscreenContainer} pointerEvents="none">
      <CameraView
        ref={ref => { cameraRef.current = ref; }}
        style={styles.camera}
        facing="back"
        mode="video"
        onCameraReady={() => {
          if (cameraRef.current && onCameraReady) {
            onCameraReady(cameraRef.current);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  offscreenContainer: {
    position: 'absolute',
    bottom: -400,
    right: -400,
    width: 320,
    height: 240,
    overflow: 'hidden',
  },
  camera: {
    width: 320,
    height: 240,
  },
});
