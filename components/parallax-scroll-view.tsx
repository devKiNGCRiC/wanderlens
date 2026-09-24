/**
 * ParallaxScrollView, a scroll view with a header image that parallaxes.
 *
 * Purpose: a leftover from the `create-expo-app` starter template's example
 * tabs. Nothing in app/ imports it today, and the real screens use
 * `ScreenBackground` + `theme` tokens instead.
 *
 * How it works:
 * - `useScrollOffset` tracks the scroll position as a Reanimated shared value
 *   (a value that lives on the UI thread, so the animation doesn't wait on JS).
 * - `useAnimatedStyle` maps that offset to a translate + scale on the header,
 *   so the header moves slower than the content and zooms on over-scroll.
 * - Colors come from the template's `useThemeColor` / `useColorScheme` hooks.
 *
 * Gotchas: `useThemeColor` imports `Colors` from constants/theme.ts, which no
 * longer exports it (only `theme`). Rendering this component would therefore
 * fail; `npx tsc --noEmit` flags the missing export in hooks/use-theme-color.ts.
 */
import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';

import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Fixed height of the parallax header, also the range the animation maps over. */
const HEADER_HEIGHT = 250;

/**
 * `headerImage` is any element drawn in the header; `headerBackgroundColor`
 * gives one color per color scheme. `children` become the scrollable body.
 */
type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
}>;

/** Scroll view whose header translates/scales with the scroll offset. */
export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
}: Props) {
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme() ?? 'light';
  // An animated ref lets Reanimated read the ScrollView's offset on the UI thread.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  // Map scroll offset to header motion: pulling down (negative offset) lifts
  // and zooms the header up to 2x; scrolling up moves it at 75% speed, which
  // is what produces the parallax "slower than content" effect.
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75]
          ),
        },
        {
          scale: interpolate(scrollOffset.value, [-HEADER_HEIGHT, 0, HEADER_HEIGHT], [2, 1, 1]),
        },
      ],
    };
  });

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={{ backgroundColor, flex: 1 }}
      scrollEventThrottle={16}>
      <Animated.View
        style={[
          styles.header,
          { backgroundColor: headerBackgroundColor[colorScheme] },
          headerAnimatedStyle,
        ]}>
        {headerImage}
      </Animated.View>
      {/* Body content scrolls normally below the animated header */}
      <ThemedView style={styles.content}>{children}</ThemedView>
    </Animated.ScrollView>
  );
}

// Template styles: plain numbers, not the app's constants/theme.ts tokens.
// `container` is declared but not referenced by the component.
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    padding: 32,
    gap: 16,
    overflow: 'hidden',
  },
});
