import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import type { PhotoStyleKey } from '@/components/PhotoStyleFrame';

const OPTIONS: { key: PhotoStyleKey; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'polaroid', label: 'Polaroid' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'filmRetro', label: 'Film retro' },
  { key: 'goldenHour', label: 'Golden hour' },
  { key: 'blueHour', label: 'Blue hour' },
  { key: 'noir', label: 'Noir' },
];

type Props = {
  value: PhotoStyleKey;
  onChange: (style: PhotoStyleKey) => void;
};

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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
});
