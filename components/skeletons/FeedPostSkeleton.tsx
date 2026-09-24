/**
 * FeedPostSkeleton, loading placeholder for one post in the Feed tab.
 *
 * Purpose: shown by the Feed tab (app/(tabs)/index.tsx) while the vertical
 * feed loads.
 *
 * How it works: stacks Skeleton blocks in the post's shape: a small avatar
 * and name bar, a 320pt image block, then three short text bars. It renders
 * one post; the Feed screen decides how many to show.
 */
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

// Layout only (spacing mirrors the real post card); colors come from Skeleton.
const styles = StyleSheet.create({
  card: { marginTop: 24, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  body: { marginTop: 10 },
});
