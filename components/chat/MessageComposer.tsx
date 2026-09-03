import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  paddingBottom: number;
};

export function MessageComposer({ value, onChangeText, onSend, onPickImage, paddingBottom }: Props) {
  const canSend = value.trim().length > 0;
  return (
    <View style={[styles.row, { paddingBottom }]}>
      {onPickImage && (
        <Pressable onPress={onPickImage} style={styles.attachBtn}>
          <Ionicons name="image-outline" size={21} color={theme.color.gold} />
        </Pressable>
      )}
      <TextInput
        style={styles.input}
        placeholder="Message..."
        placeholderTextColor={theme.color.muted}
        value={value}
        onChangeText={onChangeText}
        multiline
      />
      <Pressable onPress={onSend} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
        <Ionicons name="send" size={17} color={theme.color.dusk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'flex-end' },
  attachBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 110, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
