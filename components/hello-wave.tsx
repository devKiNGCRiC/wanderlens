/**
 * HelloWave, an animated waving-hand emoji.
 *
 * Purpose: a leftover from the `create-expo-app` starter template's home
 * screen. Nothing in the repo imports it today.
 *
 * How it works: uses Reanimated 4's CSS-style animation props
 * (`animationName` keyframes, `animationDuration`, `animationIterationCount`)
 * directly on an `Animated.Text`, rotating it 25 degrees at the halfway
 * keyframe, four times.
 */
import Animated from 'react-native-reanimated';

/** Renders the waving hand; plays its wave animation once on mount (4 cycles). */
export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
