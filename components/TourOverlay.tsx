/**
 * TourOverlay, the drawing layer of the first-run spotlight tour.
 *
 * Purpose: renders what the user sees during the tour: the whole screen
 * dimmed except for a rounded "hole" around the element being explained,
 * gold viewfinder corner brackets around that hole, and a step card with
 * title, body, progress dots, Skip and Next/Done. It is rendered only by
 * context/TourProvider.tsx, which owns all the tour logic (which step, where
 * the target is, navigation, the "seen" flag). This file just draws props.
 *
 * How it works:
 * - The root View always covers the screen (absolute fill, high zIndex) so
 *   TourProvider can measure it via `rootRef`/`onRootLayout` even when idle.
 *   When the tour is inactive it renders nothing and lets touches pass
 *   through (`pointerEvents="none"`).
 * - The dim is one SVG rectangle drawn through an SVG mask: white areas of
 *   a mask show the rectangle, black areas hide it, so a black rounded rect
 *   in the mask punches the hole.
 * - The hole's position and size live in Reanimated shared values. Moving
 *   between steps animates them (MOVE_MS), so the spotlight glides from one
 *   target to the next; the first step of a tour snaps into place instead.
 * - The card is placed above the target when the target is in the lower half
 *   of the screen, below it otherwise, or centred if there is no target rect.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import Animated, { Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import type { TourStep } from '@/constants/tourSteps';

/**
 * The highlighted element's box, in coordinates relative to the overlay's
 * root View (TourProvider converts from window coordinates), plus the
 * corner radius the cutout should use.
 */
export type TourRect = { x: number; y: number; width: number; height: number; radius: number };

/**
 * Everything comes from TourProvider:
 * - `rootRef`/`onRootLayout`: let the provider measure this overlay's root.
 * - `size`: the root's measured size, null until first layout.
 * - `step`/`index`/`total`: the current step's content and position; `step`
 *   is null when no tour is running.
 * - `rect`: the target to highlight, or null for a step with no target found.
 * - `busy`: true while the next step is being prepared (spinner on Next).
 */
type Props = {
  rootRef: RefObject<View | null>;
  onRootLayout: (e: LayoutChangeEvent) => void;
  size: { width: number; height: number } | null;
  step: TourStep | null;
  index: number;
  total: number;
  rect: TourRect | null;
  busy: boolean;
  onNext: () => void;
  onSkip: () => void;
};

/**
 * An SVG <Rect> whose props (x, y, width, ...) can be driven by Reanimated
 * on the UI thread; a plain Rect could only change via React re-renders.
 */
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Layout constants, in points:
/** Extra space between the target's edge and the edge of the hole. */
const HOLE_PAD = 4;
/** Extra space between the hole and the corner brackets. */
const BRACKET_PAD = 8;
/** Length of each corner bracket's arms. */
const BRACKET_SIZE = 16;
/** Duration of the spotlight's glide between steps, in ms. */
const MOVE_MS = 320;
/** Space between the brackets and the step card. */
const CARD_GAP = 20;
/** Minimum space between the card and the safe-area edge. */
const SCREEN_MARGIN = 16;

/**
 * Draws the tour dim, spotlight, brackets and step card. Stateless apart from
 * the animation values; `onNext`/`onSkip` hand control back to TourProvider.
 */
export function TourOverlay({ rootRef, onRootLayout, size, step, index, total, rect, busy, onNext, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  // Animated geometry of the hole: position, size and corner radius.
  // Shared values live on the UI thread, so the glide never waits on JS.
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const r = useSharedValue(0);
  // Whether the hole currently has a real position. A ref (not state) because
  // it only decides snap-vs-animate and must not cause a re-render.
  const hasRect = useRef(false);
  // The tour is drawn only when there is a step AND the root has been measured.
  const active = !!step && !!size;

  // Move the hole whenever the target rect changes: pad it by HOLE_PAD, then
  // either jump straight there (first rect of a tour) or animate there.
  useEffect(() => {
    // No rect (fallback step) or tour closed: the next rect should snap into
    // place rather than slide in from wherever the last tour left the cutout.
    if (!active || !rect) {
      hasRect.current = false;
      return;
    }
    const next = {
      x: rect.x - HOLE_PAD,
      y: rect.y - HOLE_PAD,
      w: rect.width + HOLE_PAD * 2,
      h: rect.height + HOLE_PAD * 2,
      r: rect.radius + HOLE_PAD,
    };
    // First rect: assign directly (no animation).
    if (!hasRect.current) {
      x.value = next.x; y.value = next.y; w.value = next.w; h.value = next.h; r.value = next.r;
      hasRect.current = true;
      return;
    }
    // Later rects: glide all five values together, fast then easing to a stop.
    const cfg = { duration: MOVE_MS, easing: Easing.out(Easing.cubic) };
    x.value = withTiming(next.x, cfg);
    y.value = withTiming(next.y, cfg);
    w.value = withTiming(next.w, cfg);
    h.value = withTiming(next.h, cfg);
    r.value = withTiming(next.r, cfg);
  }, [active, rect, x, y, w, h, r]);

  // Feeds the shared values into the mask's hole Rect (rx/ry round its corners).
  const holeProps = useAnimatedProps(() => ({
    x: x.value,
    y: y.value,
    width: w.value,
    height: h.value,
    rx: r.value,
    ry: r.value,
  }));

  // The bracket frame follows the same shared values, grown by BRACKET_PAD,
  // so brackets and hole always move in lockstep.
  const frameStyle = useAnimatedStyle(() => ({
    left: x.value - BRACKET_PAD,
    top: y.value - BRACKET_PAD,
    width: w.value + BRACKET_PAD * 2,
    height: h.value + BRACKET_PAD * 2,
  }));

  const isLast = index === total - 1;

  // Card sits above the highlighted element when that element is in the lower
  // half of the screen (tab bar, FABs), below it otherwise. With no rect (the
  // target never registered) it centers instead of hanging the tour. The layer
  // is bounded by the safe area on both ends, so a tall card (long copy, large
  // font scale) shrinks and scrolls its body rather than running off-screen.
  // The `size!` assertions below are safe because `active` implies size is set.
  let cardLayerStyle: object = styles.cardLayerCentered;
  if (active && rect) {
    // Compare the target's vertical centre with the screen's midline.
    const inLowerHalf = rect.y + rect.height / 2 > size!.height / 2;
    // Lower half: the layer spans from below the status bar down to just
    // above the brackets, and the card sits at its bottom (flex-end).
    // Upper half: the layer spans from just below the brackets down to the
    // bottom safe area, and the card sits at its top (flex-start).
    cardLayerStyle = inLowerHalf
      ? {
          top: insets.top + SCREEN_MARGIN,
          bottom: size!.height - (rect.y - HOLE_PAD - BRACKET_PAD) + CARD_GAP,
          justifyContent: 'flex-end',
        }
      : {
          top: rect.y + rect.height + HOLE_PAD + BRACKET_PAD + CARD_GAP,
          bottom: insets.bottom + SCREEN_MARGIN,
          justifyContent: 'flex-start',
        };
  }

  // Root: always mounted and full-screen so it can be measured. It only
  // catches touches while active, and marks itself as a modal for screen
  // readers (iOS) so focus stays on the tour. `collapsable={false}` keeps
  // Android from optimising the View away, which would break measuring it.
  return (
    <View
      ref={rootRef}
      onLayout={onRootLayout}
      collapsable={false}
      style={styles.root}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityViewIsModal={active}
    >
      {active && (
        <>
          {/* Dim layer: a full-screen dusk rectangle at 86% opacity, drawn
              through the "tourHole" mask. The mask is white everywhere
              (show the dim) except the animated black rect (hide it = hole). */}
          <Svg width={size!.width} height={size!.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <Mask id="tourHole" x="0" y="0" width={size!.width} height={size!.height}>
                <Rect x="0" y="0" width={size!.width} height={size!.height} fill="white" />
                {rect && <AnimatedRect animatedProps={holeProps} fill="black" />}
              </Mask>
            </Defs>
            <Rect
              x="0" y="0" width={size!.width} height={size!.height}
              fill={theme.color.dusk} fillOpacity={0.86}
              mask="url(#tourHole)"
            />
          </Svg>

          {/* Viewfinder corner brackets around the hole (the app's
              camera-focus motif). Touch-transparent. */}
          {rect && (
            <Animated.View style={[styles.frame, frameStyle]} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </Animated.View>
          )}

          {/* Card layer: positioned by cardLayerStyle. "box-none" means the
              layer itself ignores touches but its children (the card) don't. */}
          <View
            style={[styles.cardLayer, cardLayerStyle]}
            pointerEvents="box-none"
          >
            {/* Keyed by step id so each new step remounts the card and
                replays the fade-in. */}
            <Animated.View key={step!.id} entering={FadeIn.duration(220)} style={styles.card}>
              {/* Header: step counter ("current / total") and Skip */}
              <View style={styles.cardHeader}>
                <Text style={styles.counter}>{index + 1} / {total}</Text>
                <Pressable onPress={onSkip} hitSlop={8} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip tour">
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
              </View>
              {/* Title is a polite live region so Android screen readers
                  announce each new step. The body scrolls if the card is
                  squeezed by the layer bounds. */}
              <Text style={styles.title} accessibilityLiveRegion="polite">{step!.title}</Text>
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.body}>{step!.body}</Text>
              </ScrollView>
              {/* Footer: progress dots (current one widened and gold) and
                  Next/Done, which shows a spinner while `busy` */}
              <View style={styles.cardFooter}>
                <View style={styles.dots}>
                  {Array.from({ length: total }).map((_, i) => (
                    <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
                  ))}
                </View>
                <Pressable
                  onPress={onNext}
                  style={styles.nextBtn}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? 'Finish tour' : 'Next step'}
                >
                  {busy ? <ActivityIndicator size="small" color={theme.color.dusk} /> : <Text style={styles.nextText}>{isLast ? 'Done' : 'Next'}</Text>}
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </>
      )}
    </View>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts
// (the card shadow color is a black literal).
const styles = StyleSheet.create({
  // Overlay root and bracket frame
  root: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: BRACKET_SIZE, height: BRACKET_SIZE, borderColor: theme.color.gold },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  // Step card (flexShrink lets it shrink inside a bounded layer)
  cardLayer: { position: 'absolute', left: 20, right: 20 },
  cardLayerCentered: { top: 0, bottom: 0, justifyContent: 'center' },
  card: {
    flexShrink: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.surface2,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  counter: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1, color: theme.color.gold },
  skipBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  skip: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted },
  title: { fontFamily: theme.font.display, fontSize: 19, color: theme.color.cream },
  bodyScroll: { flexGrow: 0, marginTop: 8 },
  body: { fontFamily: theme.font.bodyRegular, fontSize: 14, lineHeight: 20, color: theme.color.muted },
  // Footer: progress dots and Next button
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: theme.radius.sm, backgroundColor: theme.color.muted, opacity: 0.35 },
  dotActive: { backgroundColor: theme.color.gold, opacity: 1, width: 16 },
  nextBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, minWidth: 84, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  nextText: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.dusk },
});
