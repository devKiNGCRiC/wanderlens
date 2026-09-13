import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import type { CaptionFontKey } from '@/components/PhotoStyleFrame';

const OPTIONS: { key: CaptionFontKey; label: string }[] = [
  { key: 'displayItalic', label: 'Elegant' },
  { key: 'display', label: 'Classic' },
  { key: 'body', label: 'Bold' },
  { key: 'bodyRegular', label: 'Simple' },
  { key: 'mono', label: 'Typewriter' },
];

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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13 },
  chipTextSelected: { color: theme.color.dusk },
});
