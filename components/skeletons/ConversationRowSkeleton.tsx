import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/Skeleton';

// Mirrors components/chat/ConversationRow.tsx's shape (50px avatar + name +
// last-message line) for the chat list's loading state.
export function ConversationRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={50} height={50} borderRadius={25} />
      <View style={styles.textCol}>
        <Skeleton width={130} height={14} />
        <Skeleton width={190} height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function ConversationRowSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => <ConversationRowSkeleton key={i} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  textCol: { flex: 1 },
});
