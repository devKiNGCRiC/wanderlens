/**
 * PhotoStylePicker, a wrapping row of chips for choosing a photo frame style.
 *
 * Purpose: the control that pairs with PhotoStyleFrame (which draws the
 * chosen style). Used on the Add Spot screen and in the Photo Styles studio
 * (app/photo-studio.tsx).
 *
 * How it works: controlled and stateless. The parent passes the current
 * `value` and receives the tapped key through `onChange`; the selected chip
 * is filled gold.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import type { PhotoStyleKey } from '@/components/PhotoStyleFrame';

/** Chip order and labels. Keys must match PhotoStyleFrame's PhotoStyleKey union. */
const OPTIONS: { key: PhotoStyleKey; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'polaroid', label: 'Polaroid' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'filmRetro', label: 'Film retro' },
  { key: 'goldenHour', label: 'Golden hour' },
  { key: 'blueHour', label: 'Blue hour' },
  { key: 'noir', label: 'Noir' },
];

/** `value` is the selected style; `onChange` receives the tapped one. */
type Props = {
  value: PhotoStyleKey;
  onChange: (style: PhotoStyleKey) => void;
};

/** Renders one chip per style; tapping a chip reports its key to the parent. */
export function PhotoStylePicker({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.key}
          onPress={() => onChange(opt.key)}
          style={[styles.chip, value === opt.key && styles.chipSelected]}
        >
          <Text style={[styles.chipText, value === opt.key && styles.chipTextSelected]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Colors and fonts come from theme tokens in constants/theme.ts. Same chip
// look as CaptionFontPicker, with a 44pt minimum touch height.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
});
