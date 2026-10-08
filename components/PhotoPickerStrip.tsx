/**
 * PhotoPickerStrip, the photo row on Add Spot once at least one photo is picked.
 *
 * Purpose: lets a user build a multi-photo post (up to MAX_SPOT_PHOTOS) and
 * choose its cover. The first photo is the cover, the hero shown on the map
 * pin, the feed's first slide and the Captures grid.
 *
 * How it works:
 * - A horizontal ScrollView (at most 10 items, so no FlatList is needed).
 * - Tapping a non-cover thumbnail makes it the cover (moves it to index 0);
 *   tap-to-promote instead of drag-to-reorder keeps it accessible and adds
 *   no gesture dependency.
 * - The ✕ removes a photo; the trailing "+" tile adds more while under the cap.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { MAX_SPOT_PHOTOS } from '@/lib/spotPhotos';

type Props = {
  uris: string[];
  onMakeCover: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  // True while the post is uploading: the photos must not change mid-save.
  disabled?: boolean;
};

export function PhotoPickerStrip({ uris, onMakeCover, onRemove, onAdd, disabled = false }: Props) {
  const full = uris.length >= MAX_SPOT_PHOTOS;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {uris.map((uri, i) => (
          <View key={uri} style={styles.thumbWrap}>
            <Pressable
              onPress={() => onMakeCover(i)}
              disabled={disabled || i === 0}
              accessibilityRole="button"
              accessibilityState={{ selected: i === 0, disabled: disabled || i === 0 }}
              accessibilityLabel={i === 0 ? `Photo 1, the cover` : `Photo ${i + 1}. Tap to make it the cover`}
              style={[styles.thumb, i === 0 && styles.thumbCover]}
            >
              <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
              {i === 0 && (
                <View style={styles.coverTag}>
                  <Text style={styles.coverTagText}>Cover</Text>
                </View>
              )}
            </Pressable>
            {/* Inside the thumbnail, so the ScrollView never clips its touch area. */}
            <Pressable onPress={() => onRemove(i)} disabled={disabled} style={styles.removeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
              <Ionicons name="close" size={16} color={theme.color.cream} />
            </Pressable>
          </View>
        ))}
        {!full && (
          <Pressable onPress={onAdd} disabled={disabled} style={styles.addTile} accessibilityRole="button" accessibilityLabel="Add more photos">
            <Ionicons name="add" size={24} color={theme.color.gold} />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        )}
      </ScrollView>
      <Text style={styles.hint}>
        <Text style={styles.hintCount}>{uris.length}/{MAX_SPOT_PHOTOS}</Text>
        {'  '}{full ? 'that’s the full roll' : uris.length > 1 ? 'tap a photo to make it the cover' : 'add more angles of this spot'}
      </Text>
    </View>
  );
}

const THUMB = 84;

const styles = StyleSheet.create({
  row: { gap: 12, paddingTop: 4, paddingRight: 12 },
  thumbWrap: { width: THUMB, height: THUMB },
  thumb: { width: THUMB, height: THUMB, borderRadius: theme.radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.surface2 },
  thumbCover: { borderWidth: 2, borderColor: theme.color.gold },
  thumbImage: { width: '100%', height: '100%' },
  coverTag: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.color.gold, paddingVertical: 2, alignItems: 'center' },
  coverTagText: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.dusk },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.photoScrim, alignItems: 'center', justifyContent: 'center' },
  addTile: { width: THUMB, height: THUMB, borderRadius: theme.radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.gold, marginTop: 2 },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 8 },
  hintCount: { fontFamily: theme.font.mono },
});
