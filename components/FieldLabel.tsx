/**
 * FieldLabel, a form field's label that can flag the field as missing.
 *
 * Purpose: after a failed Save, each required field that's still empty
 * shows "· Required" in ember next to its label, so the user sees exactly
 * which ones to fill instead of hunting through the form. The flag goes
 * away as soon as the field is filled (the screen recomputes `missing`).
 *
 * The screen passes its own label style, so spacing stays as it was.
 */
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  text: string;
  // True only once the user has tried to save and this field is still empty.
  missing: boolean;
  style: StyleProp<TextStyle>;
};

export function FieldLabel({ text, missing, style }: Props) {
  if (!missing) return <Text style={style}>{text}</Text>;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${text}, required`}>
      <Text style={style}>{text}</Text>
      <Text style={[style, styles.required]}> · Required</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  required: { color: theme.color.ember },
});
