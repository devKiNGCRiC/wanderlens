/**
 * Skeleton, a single pulsing grey block used as a loading placeholder.
 *
 * Purpose: the base piece every loading skeleton in components/skeletons
 * is built from (feed posts, spot detail, person cards, conversation rows,
 * polaroid grid). Screens show those while their data loads.
 *
 * How it works:
 * - Reanimated keeps the block's opacity in a shared value (a value that
 *   lives on the UI thread, so the pulse keeps running even if JS is busy).
 * - On mount it starts an endless 0.35 -> 0.85 -> 0.35 fade, 800ms each way.
 * - Size and corner radius are props, so skeletons can mimic text lines,
 *   avatars (radius = half the size) or images.
 */
import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { theme } from '@/constants/theme';

/**
 * `width`/`height` accept numbers or percentages (default full width x 16pt);
 * `style` is merged last for margins and other layout tweaks.
 */
type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: object;
};

// A single pulsing placeholder block — the building piece every per-screen
// skeleton layout below composes from. Opacity-pulse rather than a
// translating shimmer sweep: simpler, no measurement/clipping edge cases,
// and reads just as clearly as "loading" per .claude/rules/ui-ux.md's
// "Loading — ActivityIndicator in gold, or a skeleton for grids".
export function Skeleton({ width = '100%', height = 16, borderRadius = theme.radius.sm, style }: Props) {
  // Starting (dimmest) opacity.
  const opacity = useSharedValue(0.35);

  // Start the pulse once on mount: withRepeat(..., -1, true) repeats forever
  // and reverses each cycle, so it fades up then back down.
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  // Re-computed on the UI thread whenever `opacity` changes.
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Base block in theme `surface2`, then the animated opacity, then caller overrides.
  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: theme.color.surface2 }, animatedStyle, style]} />;
}
