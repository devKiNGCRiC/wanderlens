import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type ActionSheetOption = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
};

// Android's native Alert.alert only reliably renders up to 3 buttons — extra
// ones (including Cancel) silently disappear. Anything with more than a
// yes/no choice belongs here instead, not in Alert.alert.
export function ActionSheet({ visible, onClose, title, options }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {title && <Text style={styles.title}>{title}</Text>}
          {options.map((opt) => (
            <Pressable key={opt.key} style={styles.row} onPress={() => { onClose(); opt.onPress(); }}>
              {opt.icon && <Ionicons name={opt.icon} size={19} color={opt.destructive ? theme.color.ember : theme.color.cream} />}
              <Text style={[styles.rowText, opt.destructive && styles.rowTextDestructive]}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelRow} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14.5, color: theme.color.cream },
  rowTextDestructive: { color: theme.color.ember },
  cancelRow: { paddingVertical: 13, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.color.surface2, alignItems: 'center' },
  cancelText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.muted },
});
