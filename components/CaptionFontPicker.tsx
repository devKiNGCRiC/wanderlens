/**
 * CaptionFontPicker, a row of chips for choosing the caption typeface.
 *
 * Purpose: lets the user pick which font the caption is drawn in on a styled
 * photo (see PhotoStyleFrame). Used on the Add Spot screen and in the Photo
 * Styles studio (app/photo-studio.tsx).
 *
 * How it works:
 * - Controlled component: the parent owns `value` and gets updates through
 *   `onChange`; this file keeps no state.
 * - Each option key is a `theme.font` key, so `theme.font[opt.key]` resolves
 *   straight to a loaded font family.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import type { CaptionFontKey } from '@/components/PhotoStyleFrame';

/** The five caption fonts, each with a friendly label shown on its chip. */
const OPTIONS: { key: CaptionFontKey; label: string }[] = [
  { key: 'displayItalic', label: 'Elegant' },
  { key: 'display', label: 'Classic' },
  { key: 'body', label: 'Bold' },
  { key: 'bodyRegular', label: 'Simple' },
  { key: 'mono', label: 'Typewriter' },
];

/** `value` is the currently selected font key; `onChange` receives the tapped one. */
type Props = {
  value: CaptionFontKey;
  onChange: (font: CaptionFontKey) => void;
};

// Each chip renders its own label in the font it represents, so the choice
// is visible at a glance rather than a plain name.
export function CaptionFontPicker({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.key}
          onPress={() => onChange(opt.key)}
          style={[styles.chip, value === opt.key && styles.chipSelected]}
        >
          <Text style={[styles.chipText, { fontFamily: theme.font[opt.key] }, value === opt.key && styles.chipTextSelected]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Colors come from theme tokens in constants/theme.ts. Chips keep a 44pt
// minimum height to meet the touch-target rule; the font family is set
// per chip inline because it differs per option.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13 },
  chipTextSelected: { color: theme.color.dusk },
});
