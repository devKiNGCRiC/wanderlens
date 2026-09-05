import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type AttachMenuOption = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  iconColor: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  options: AttachMenuOption[];
};

export function AttachMenu({ visible, onClose, options }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.grid}>
            {options.map((opt) => (
              <Pressable key={opt.key} style={styles.cell} onPress={() => { onClose(); opt.onPress(); }}>
                <View style={[styles.iconCircle, { backgroundColor: opt.color }]}>
                  <Ionicons name={opt.icon} size={24} color={opt.iconColor} />
                </View>
                <Text style={styles.cellLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 12 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cellLabel: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.cream },
});
