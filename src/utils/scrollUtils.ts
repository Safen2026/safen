import { ScrollView } from 'react-native';

/**
 * Performs a highly-optimized, 60fps cinematic scroll on a ScrollView.
 * Uses requestAnimationFrame instead of setTimeout to perfectly sync with the device's refresh rate,
 * eliminating any "stumbling" or jank.
 * 
 * @param scrollViewRef Reference to the ScrollView to animate
 * @param maxScroll The maximum Y distance to scroll
 * @param duration The duration of the scroll in milliseconds (default 1800ms)
 * @returns A cleanup function to cancel the animation if the component unmounts early
 */
export const cinematicScroll = (
  scrollViewRef: React.RefObject<ScrollView | null>,
  maxScroll: number,
  duration: number = 1200
): () => void => {
  if (!scrollViewRef.current || maxScroll <= 0) return () => {};

  const startTime = Date.now();
  let animationFrameId: number;
  let lastY = -1;

  const step = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Smooth ease-out-quart: starts confidently, slows down gracefully
    const ease = 1 - Math.pow(1 - progress, 4);
    
    // Snap to integer to prevent sub-pixel rendering jitter on iOS/Android
    const y = Math.round(ease * maxScroll);
    
    // Only cross the React Native bridge if the pixel actually changed
    if (y !== lastY) {
      scrollViewRef.current?.scrollTo({ y, animated: false });
      lastY = y;
    }
    
    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    }
  };

  animationFrameId = requestAnimationFrame(step);

  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  };
};
