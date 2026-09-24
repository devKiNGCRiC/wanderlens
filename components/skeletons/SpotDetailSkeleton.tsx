/**
 * SpotDetailSkeleton, loading placeholder for the spot detail page.
 *
 * Purpose: shown by app/spot/[id].tsx while the spot loads.
 *
 * How it works: a full-width 300pt hero block, then a padded body with a
 * creator avatar + name, a title bar, two tag pills and three description
 * lines of decreasing width.
 */
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/Skeleton';

// Mirrors app/spot/[id].tsx's loaded layout (heroImage/creatorAvatar+Name/
// title/metaRow tags/description) so the loading state previews the real
// shape of the page rather than a bare spinner.
export function SpotDetailSkeleton() {
  return (
    <View>
      <Skeleton width="100%" height={300} borderRadius={0} />
      <View style={styles.body}>
        <View style={styles.creatorRow}>
          <Skeleton width={28} height={28} borderRadius={14} />
          <Skeleton width={90} height={12} />
        </View>
        <Skeleton width="70%" height={22} style={{ marginTop: 16 }} />
        <View style={styles.metaRow}>
          <Skeleton width={70} height={24} borderRadius={20} />
          <Skeleton width={70} height={24} borderRadius={20} />
        </View>
        <Skeleton width="100%" height={14} style={{ marginTop: 16 }} />
        <Skeleton width="90%" height={14} style={{ marginTop: 8 }} />
        <Skeleton width="60%" height={14} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

// Layout only; colors come from Skeleton (theme surface2).
const styles = StyleSheet.create({
  body: { padding: 20 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
