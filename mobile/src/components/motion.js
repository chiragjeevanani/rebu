// Animation primitives used by the bottom tab bar (Reanimated — runs on the UI thread).
import React, { useEffect } from 'react';
import Animated, {
  Easing,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Pops in with a springy zoom (tab badges). */
export function Pop({ delay = 0, style, children }) {
  return (
    <Animated.View
      entering={ZoomIn.delay(delay).springify().damping(10).stiffness(180)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Soft looping pulse ring behind a status dot. */
export function PulseRing({
  size,
  color,
  style,
  duration = 1600,
  maxScale = 2.2,
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t, duration]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - t.value),
    transform: [{ scale: 1 + t.value * (maxScale - 1) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
        animated,
      ]}
    />
  );
}
