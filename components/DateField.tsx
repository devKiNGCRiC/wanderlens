/**
 * DateField, a tappable input box that opens the native date picker.
 *
 * Purpose: date entry on the onboarding and Edit Profile screens.
 *
 * How it works:
 * - Looks like the app's other text fields: shows the chosen date (in the
 *   device locale's format) or `label` as a muted placeholder.
 * - Tapping sets `visible`, which mounts `@react-native-community/datetimepicker`.
 * - The picker's onChange fires with `event.type === 'set'` when a date is
 *   confirmed and 'dismissed' on cancel; only 'set' is passed to the parent.
 * - Controlled: the parent owns `value` and stores whatever `onChange` gives it.
 *
 * Gotchas: `visible` is only reset on Android. On iOS, once opened, the picker
 * stays mounted under the field until the screen unmounts.
 */
import { useState } from 'react';
import { Text, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '@/constants/theme';

/**
 * `label` doubles as the placeholder; `value` is null until the user picks;
 * `minimumDate` optionally blocks earlier dates in the picker.
 */
type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
};

// Android's picker is a native modal dialog — it must be conditionally
// mounted (shown on tap, unmounted once a value is picked) rather than kept
// always on-screen the way iOS's inline spinner variant could be.
export function DateField({ label, value, onChange, minimumDate }: Props) {
  // Whether the native picker is currently mounted.
  const [visible, setVisible] = useState(false);

  // Fragment: the field and (when open) the picker sit side by side in the parent.
  return (
    <>
      <Pressable style={styles.field} onPress={() => setVisible(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? value.toLocaleDateString() : label}
        </Text>
      </Pressable>
      {visible && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          minimumDate={minimumDate}
          onChange={(event, selectedDate) => {
            // Android's dialog closes itself on any outcome, so unmount it to
            // match; then forward the date only if the user confirmed ('set').
            if (Platform.OS === 'android') setVisible(false);
            if (event.type === 'set' && selectedDate) onChange(selectedDate);
          }}
        />
      )}
    </>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts;
// the field matches the look of the app's TextInputs.
const styles = StyleSheet.create({
  field: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, justifyContent: 'center' },
  valueText: { color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15 },
  placeholderText: { color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 15 },
});
