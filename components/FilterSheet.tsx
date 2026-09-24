/**
 * FilterSheet, the Feed tab's bottom sheet for filtering by genre and time of day.
 *
 * Purpose: opened from the filter button on the Feed tab (app/(tabs)/index.tsx)
 * to narrow the vertical feed to one photography genre and/or one time of day.
 *
 * How it works:
 * - The Feed screen owns the applied `genre`/`time`. This sheet copies them
 *   into local "draft" state when it opens, so the user can toggle chips
 *   freely without changing the feed until they press Apply.
 * - Each group is single-select; tapping the selected chip again clears it (null).
 * - Apply hands both drafts back via `onApply` and closes. Closing any other
 *   way (backdrop, Android back) discards the draft.
 * - "Clear all" only resets the draft; it still needs Apply to take effect.
 */
import { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

/** Genre chip labels; the chosen string is passed back to the Feed as-is. */
const GENRE_FILTERS = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
/** Time-of-day chip labels. */
const TIME_FILTERS = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** `genre`/`time` are the currently applied filters (null = no filter). */
type Props = {
  visible: boolean;
  onClose: () => void;
  genre: string | null;
  time: string | null;
  onApply: (genre: string | null, time: string | null) => void;
};

export function FilterSheet({ visible, onClose, genre, time, onApply }: Props) {
  // Draft selections, edited in the sheet and only committed on Apply.
  const [localGenre, setLocalGenre] = useState(genre);
  const [localTime, setLocalTime] = useState(time);

  // Each time the sheet opens, re-sync the drafts with the applied filters so
  // an un-applied edit from a previous opening doesn't linger. Keyed on
  // `visible` only (genre/time are read but not listed as deps), so it runs
  // on open/close rather than whenever the parent's filters change.
  useEffect(() => {
    if (visible) { setLocalGenre(genre); setLocalTime(time); }
  }, [visible]);

  // Backdrop tap closes; the inner Pressable stops taps on the sheet itself
  // from bubbling to the backdrop.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Filters</Text>

          {/* Genre chips: single-select, tap again to deselect */}
          <Text style={styles.label}>Genre</Text>
          <View style={styles.row}>
            {GENRE_FILTERS.map((g) => (
              <Pressable key={g} onPress={() => setLocalGenre(localGenre === g ? null : g)} style={[styles.chip, localGenre === g && styles.chipSelected]}>
                <Text style={[styles.chipText, localGenre === g && styles.chipTextSelected]}>{g}</Text>
              </Pressable>
            ))}
          </View>

          {/* Time-of-day chips: same toggle behaviour as genre */}
          <Text style={styles.label}>Time of day</Text>
          <View style={styles.row}>
            {TIME_FILTERS.map((t) => (
              <Pressable key={t} onPress={() => setLocalTime(localTime === t ? null : t)} style={[styles.chip, localTime === t && styles.chipSelected]}>
                <Text style={[styles.chipText, localTime === t && styles.chipTextSelected]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {/* Footer: Clear resets the draft only; Apply commits it and closes */}
          <View style={styles.actions}>
            <Pressable onPress={() => { setLocalGenre(null); setLocalTime(null); }} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear all</Text>
            </Pressable>
            <Pressable onPress={() => { onApply(localGenre, localTime); onClose(); }} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  // Sheet chrome
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 28, paddingBottom: 50, borderWidth: 1, borderColor: theme.color.surface2 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 16 },
  heading: { fontFamily: theme.font.display, fontSize: 19, color: theme.color.cream, marginBottom: 18 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 10, marginTop: 6 },
  // Chip groups
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream },
  chipTextSelected: { fontFamily: theme.font.body, color: theme.color.dusk },
  // Footer buttons (Apply is twice as wide as Clear)
  actions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  clearBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.surface2 },
  clearBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.muted },
  applyBtn: { flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: theme.radius.md, backgroundColor: theme.color.gold },
  applyBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.dusk },
});