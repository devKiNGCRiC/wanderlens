import { useEffect, useRef, type RefObject } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import Animated, { Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import type { TourStep } from '@/constants/tourSteps';

export type TourRect = { x: number; y: number; width: number; height: number; radius: number };

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

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const HOLE_PAD = 4;
const BRACKET_PAD = 8;
const BRACKET_SIZE = 16;
const MOVE_MS = 320;
const CARD_GAP = 20;
const SCREEN_MARGIN = 16;

export function TourOverlay({ rootRef, onRootLayout, size, step, index, total, rect, busy, onNext, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const r = useSharedValue(0);
  const hasRect = useRef(false);
  const active = !!step && !!size;

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
    if (!hasRect.current) {
      x.value = next.x; y.value = next.y; w.value = next.w; h.value = next.h; r.value = next.r;
      hasRect.current = true;
      return;
    }
    const cfg = { duration: MOVE_MS, easing: Easing.out(Easing.cubic) };
    x.value = withTiming(next.x, cfg);
    y.value = withTiming(next.y, cfg);
    w.value = withTiming(next.w, cfg);
    h.value = withTiming(next.h, cfg);
    r.value = withTiming(next.r, cfg);
  }, [active, rect, x, y, w, h, r]);

  const holeProps = useAnimatedProps(() => ({
    x: x.value,
    y: y.value,
    width: w.value,
    height: h.value,
    rx: r.value,
    ry: r.value,
  }));

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
  let cardLayerStyle: object = styles.cardLayerCentered;
  if (active && rect) {
    const inLowerHalf = rect.y + rect.height / 2 > size!.height / 2;
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

          {rect && (
            <Animated.View style={[styles.frame, frameStyle]} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </Animated.View>
          )}

          <View
            style={[styles.cardLayer, cardLayerStyle]}
            pointerEvents="box-none"
          >
            <Animated.View key={step!.id} entering={FadeIn.duration(220)} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.counter}>{index + 1} / {total}</Text>
                <Pressable onPress={onSkip} hitSlop={8} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip tour">
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
              </View>
              <Text style={styles.title} accessibilityLiveRegion="polite">{step!.title}</Text>
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.body}>{step!.body}</Text>
              </ScrollView>
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

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: BRACKET_SIZE, height: BRACKET_SIZE, borderColor: theme.color.gold },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
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
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: theme.radius.sm, backgroundColor: theme.color.muted, opacity: 0.35 },
  dotActive: { backgroundColor: theme.color.gold, opacity: 1, width: 16 },
  nextBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, minWidth: 84, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  nextText: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.dusk },
});
