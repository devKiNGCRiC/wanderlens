import { useState } from 'react';
import { Text, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '@/constants/theme';

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
  const [visible, setVisible] = useState(false);

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
            if (Platform.OS === 'android') setVisible(false);
            if (event.type === 'set' && selectedDate) onChange(selectedDate);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, minHeight: 44, justifyContent: 'center' },
  valueText: { color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15 },
  placeholderText: { color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 15 },
});
