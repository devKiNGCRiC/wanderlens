import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/Skeleton';
import { theme } from '@/constants/theme';

// Mirrors the real feed post card's shape in app/(tabs)/index.tsx (postCard/
// postHeader/postAvatar/postImage/postBody) so the loading state reads as a
// natural stand-in rather than a generic block.
export function FeedPostSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Skeleton width={30} height={30} borderRadius={15} />
        <Skeleton width={100} height={12} />
      </View>
      <Skeleton width="100%" height={320} borderRadius={theme.radius.md} />
      <View style={styles.body}>
        <Skeleton width={80} height={12} />
        <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width={60} height={10} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 24, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  body: { marginTop: 10 },
});
