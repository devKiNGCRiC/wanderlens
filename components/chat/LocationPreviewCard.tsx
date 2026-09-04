import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  label: string | null;
  lat: number;
  lng: number;
  onPress: () => void;
};

export function LocationPreviewCard({ label, lat, lng, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.thumbWrap}>
        <View style={styles.thumb}><Ionicons name="location" size={20} color={theme.color.gold} /></View>
        <View style={styles.thumbCornerTL} />
        <View style={styles.thumbCornerBR} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{label || 'Shared location'}</Text>
        <Text style={styles.meta} numberOfLines={1}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={theme.color.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 8, width: 220 },
  thumbWrap: { width: 46, height: 46, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center' },
  thumbCornerTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: theme.color.gold },
  thumbCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.color.gold },
  body: { flex: 1 },
  title: { fontFamily: theme.font.display, fontSize: 13.5, color: theme.color.cream },
  meta: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 3 },
});
