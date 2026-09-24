/**
 * PolaroidGridSkeleton, loading placeholder for a 3-column polaroid grid.
 *
 * Purpose: shown by the Profile tab's Captures grid and the /saved screen
 * while their spots load.
 *
 * How it works: a wrapping row of `count` cells, each a third of the width
 * with PolaroidGridItem's aspect ratio and padding, filled by one Skeleton.
 * The cells are not rotated like the real tiles.
 */
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/Skeleton';

// Mirrors components/PolaroidGridItem.tsx's cell shape (aspectRatio 0.85,
// 3 columns) so a loading grid (profile Captures, Saved) previews the real
// layout instead of an empty gap or a bare spinner.
export function PolaroidGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cell}>
          <Skeleton width="100%" height="100%" borderRadius={3} />
        </View>
      ))}
    </View>
  );
}

// Layout only; `cell` copies PolaroidGridItem's gridItem sizing.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', aspectRatio: 0.85, padding: 4 },
});
