import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { theme } from '@/constants/theme';

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
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: theme.color.surface2 }, animatedStyle, style]} />;
}
