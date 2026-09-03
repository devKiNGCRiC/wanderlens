import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  title: string | null;
  photoUrl: string | null;
  genre: string | null;
  locationLabel: string | null;
  onPress: () => void;
};

export function SpotPreviewCard({ title, photoUrl, genre, locationLabel, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.thumbWrap}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
        <View style={styles.thumbCornerTL} />
        <View style={styles.thumbCornerBR} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title || 'A spot on Wanderlens'}</Text>
        <Text style={styles.meta} numberOfLines={1}>{[genre, locationLabel].filter(Boolean).join(' · ') || 'Tap to view'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.color.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 8, width: 220 },
  thumbWrap: { width: 46, height: 46, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: theme.color.surface2 },
  thumbCornerTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: theme.color.gold },
  thumbCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.color.gold },
  body: { flex: 1 },
  title: { fontFamily: theme.font.display, fontSize: 13.5, color: theme.color.cream },
  meta: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 3 },
});
