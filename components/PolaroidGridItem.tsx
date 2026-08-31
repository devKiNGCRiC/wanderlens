import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

const ROTATIONS = [-2, 1.5, -1];
export function rotationFor(index: number) {
  return ROTATIONS[index % ROTATIONS.length];
}

export function PolaroidGridItem({ photoUrl, caption, rotate = 0, onPress }: { photoUrl: string | null; caption?: string | null; rotate?: number; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.75 }]} onPress={onPress}>
      <View style={[styles.frame, { transform: [{ rotate: `${rotate}deg` }] }]}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.image} /> : <View style={styles.fallback}><Ionicons name="camera-outline" size={16} color={theme.color.muted} /></View>}
        {caption ? <Text style={styles.caption} numberOfLines={1}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridItem: { flex: 1 / 3, aspectRatio: 0.85, padding: 4 },
  frame: { flex: 1, backgroundColor: theme.color.cream, borderRadius: 3, padding: 4, paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  image: { flex: 1, borderRadius: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface2 },
  caption: { fontFamily: theme.font.displayItalic, fontSize: 8, color: theme.color.dusk, textAlign: 'center', marginTop: 3 },
});