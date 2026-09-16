import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/Skeleton';
import { theme } from '@/constants/theme';

// Mirrors the personCard shape shared by Discover/Trip/Requests/Connections
// in app/(tabs)/connect.tsx (avatarRing + name + meta line + action button).
export function PersonCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={50} height={50} borderRadius={25} />
        <View style={styles.textCol}>
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={10} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width="100%" height={30} borderRadius={20} style={{ marginTop: 12 }} />
    </View>
  );
}

export function PersonCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => <PersonCardSkeleton key={i} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textCol: { flex: 1 },
});
