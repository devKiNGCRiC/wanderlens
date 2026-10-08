/**
 * SortChips, the Feed's "how should Explore be ordered" control.
 *
 * Purpose: one tap to switch the Explore list between For you, Recent,
 * Nearby, Most liked and Most discussed (the explore_spots RPC's p_sort).
 * For the two popularity sorts a second row picks the time window, so last
 * year's hits don't sit on top forever. Genre / time-of-day filtering stays
 * in FilterSheet and combines with any sort.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/theme';

export type FeedSort = 'for_you' | 'recent' | 'nearby' | 'liked' | 'discussed';
export type FeedWindow = 'week' | 'month' | 'all';

const SORTS: { key: FeedSort; label: string }[] = [
  { key: 'for_you', label: 'For you' },
  { key: 'recent', label: 'Recent' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'liked', label: 'Most liked' },
  { key: 'discussed', label: 'Most discussed' },
];

const WINDOWS: { key: FeedWindow; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

/** True for the sorts that rank by a count and so take a time window. */
export function sortUsesWindow(sort: FeedSort) {
  return sort === 'liked' || sort === 'discussed';
}

type Props = {
  sort: FeedSort;
  window: FeedWindow;
  onChangeSort: (sort: FeedSort) => void;
  onChangeWindow: (window: FeedWindow) => void;
};

export function SortChips({ sort, window, onChangeSort, onChangeWindow }: Props) {
  // A light tick, the same weight as the tab bar (haptic-tab.tsx); skipped
  // when the chip is already selected so a re-tap isn't a fake action.
  function pickSort(next: FeedSort) {
    if (next === sort) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeSort(next);
  }
  function pickWindow(next: FeedWindow) {
    if (next === window) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeWindow(next);
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SORTS.map((s) => {
          const selected = s.key === sort;
          return (
            <Pressable
              key={s.key}
              onPress={() => pickSort(s.key)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Sort by ${s.label}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {sortUsesWindow(sort) && (
        <View style={styles.windowRow}>
          {WINDOWS.map((w) => {
            const selected = w.key === window;
            return (
              <Pressable
                key={w.key}
                onPress={() => pickWindow(w.key)}
                style={[styles.windowChip, selected && styles.windowChipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Time window: ${w.label}`}
              >
                <Text style={[styles.windowText, selected && styles.windowTextSelected]}>{w.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.surface2 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream },
  chipTextSelected: { fontFamily: theme.font.body, color: theme.color.dusk },
  windowRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 8 },
  windowChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: theme.radius.lg },
  windowChipSelected: { backgroundColor: theme.color.goldBadgeTint },
  windowText: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted },
  windowTextSelected: { color: theme.color.gold },
});
