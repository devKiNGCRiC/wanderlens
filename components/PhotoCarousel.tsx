/**
 * PhotoCarousel, a swipeable strip of a spot's photos.
 *
 * Purpose: shows every photo of a multi-photo spot in the Feed and on Spot
 * Detail, while the map keeps showing only the hero. With a single photo it
 * renders a plain image with no chrome, so older one-photo spots look exactly
 * as they did before.
 *
 * How it works:
 * - A horizontal, paging FlatList; each page is exactly the measured width,
 *   so `getItemLayout` is exact and swipes snap one photo at a time.
 * - The width comes from onLayout, so it fits whatever padding the parent has.
 * - A "2/7" counter in IBM Plex Mono (metadata voice) plus page dots.
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { theme } from '@/constants/theme';
import type { SpotPhoto } from '@/lib/spotPhotos';

type Props = {
  photos: SpotPhoto[];
  height: number;
  // Tapping a photo; receives its index (Spot Detail opens the viewer on it).
  onPress?: (index: number) => void;
  // Outer container style, e.g. a corner radius.
  style?: StyleProp<ViewStyle>;
  // Used in accessibility labels, e.g. the spot title.
  label?: string;
};

export function PhotoCarousel({ photos, height, onPress, style, label = 'Spot photo' }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  // Settled page after a swipe; rounding absorbs sub-pixel offsets.
  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }, [width]);
  const getItemLayout = useCallback((_: ArrayLike<SpotPhoto> | null | undefined, i: number) => ({ length: width, offset: width * i, index: i }), [width]);
  const renderItem = useCallback(({ item, index: i }: { item: SpotPhoto; index: number }) => (
    <Pressable
      onPress={onPress ? () => onPress(i) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'imagebutton' : 'image'}
      accessibilityLabel={`${label}, photo ${i + 1} of ${photos.length}`}
    >
      <Image source={{ uri: item.photo_url }} style={{ width, height }} contentFit="cover" transition={150} />
    </Pressable>
  ), [width, height, onPress, label, photos.length]);

  if (photos.length === 0) return null;

  // One photo: no list, no counter, identical to the pre-carousel layout.
  if (photos.length === 1) {
    return (
      <Pressable onPress={onPress ? () => onPress(0) : undefined} disabled={!onPress} style={[styles.container, style]} accessibilityRole={onPress ? 'imagebutton' : 'image'} accessibilityLabel={label}>
        <Image source={{ uri: photos[0].photo_url }} style={[styles.single, { height }]} contentFit="cover" transition={150} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { height }, style]} onLayout={onLayout}>
      {width > 0 && (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.photo_url}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumEnd}
          initialNumToRender={2}
          windowSize={3}
        />
      )}
      {/* Announced to screen readers as the page changes. */}
      <View style={styles.counter} pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}>
        <Text style={styles.counterText}>{index + 1}/{photos.length}</Text>
      </View>
      <View style={styles.dotsRow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.dots}>
          {photos.map((p, i) => <View key={p.photo_url} style={[styles.dot, i === index && styles.dotActive]} />)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // surface shows while the width is measured and while each photo loads.
  container: { overflow: 'hidden', backgroundColor: theme.color.surface },
  single: { width: '100%' },
  counter: { position: 'absolute', top: 12, right: 12, backgroundColor: theme.color.photoScrim, borderRadius: theme.radius.lg, paddingHorizontal: 8, paddingVertical: 4 },
  counterText: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.cream },
  // The dots sit on a scrim pill so they stay visible over snow, sky or sand.
  dotsRow: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 4, backgroundColor: theme.color.photoScrim, borderRadius: theme.radius.lg, paddingHorizontal: 8, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.dotInactive },
  dotActive: { backgroundColor: theme.color.gold, width: 16 },
});
