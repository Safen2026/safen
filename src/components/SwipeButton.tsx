import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface SwipeButtonProps {
  onComplete: () => void;
  loading: boolean;
}

const BUTTON_HEIGHT = 64;
const PADDING = 8;
const THUMB_SIZE = BUTTON_HEIGHT - PADDING * 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const BUTTON_WIDTH = SCREEN_WIDTH - 48; // accounting for screen padding
const SWIPE_RANGE = BUTTON_WIDTH - THUMB_SIZE - PADDING * 2;

export const SwipeButton = ({ onComplete, loading }: SwipeButtonProps) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const [completed, setCompleted] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (loading || completed) return;
        if (gestureState.dx > 0 && gestureState.dx <= SWIPE_RANGE) {
          pan.setValue({ x: gestureState.dx, y: 0 });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (loading || completed) return;
        
        if (gestureState.dx > SWIPE_RANGE * 0.7) {
          // Snap to end and complete
          Animated.spring(pan, {
            toValue: { x: SWIPE_RANGE, y: 0 },
            useNativeDriver: false,
          }).start(() => {
            setCompleted(true);
            onComplete();
          });
        } else {
          // Snap back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Reset state if loading turns from true back to false (e.g. after modal closes)
  React.useEffect(() => {
    if (!loading && completed) {
      setCompleted(false);
      Animated.timing(pan, {
        toValue: { x: 0, y: 0 },
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [loading]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {loading ? 'Submitting...' : 'Swipe to Submit'}
      </Text>
      
      {!loading && (
        <View style={styles.arrowIcon}>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#00875A" />
        </View>
      )}

      <Animated.View
        style={[
          styles.thumb,
          { transform: [{ translateX: pan.x }] }
        ]}
        {...panResponder.panHandlers}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <MaterialCommunityIcons name="chevron-double-right" size={28} color={colors.white} />
        )}
      </Animated.View>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    height: BUTTON_HEIGHT,
    backgroundColor: '#E6F4F1',
    borderRadius: BUTTON_HEIGHT / 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: PADDING,
    width: '100%',
  },
  text: {
    color: '#00875A',
    fontSize: 16,
    fontWeight: 'bold',
    position: 'absolute',
    zIndex: 1,
  },
  arrowIcon: {
    position: 'absolute',
    right: 24,
    zIndex: 1,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#00875A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: PADDING,
    zIndex: 2,
  },
});
