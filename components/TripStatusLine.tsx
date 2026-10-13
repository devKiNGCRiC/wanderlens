/**
 * TripStatusLine, a profile's trip under its bio.
 *
 * Purpose: shows where someone is heading, is right now, or last went, so
 * people meeting on Connect can see it (Connect's trip matching uses the
 * same fields). Used on the Profile tab and public profiles. Renders nothing
 * when the profile has no complete trip. Status comes from lib/tripStatus.ts.
 */
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { tripStatus } from '@/lib/tripStatus';

type Props = {
  destinations: string[] | null;
  startDate: string | null;
  endDate: string | null;
};

export function TripStatusLine({ destinations, startDate, endDate }: Props) {
  const status = tripStatus(destinations, startDate, endDate);
  if (!status) return null;
  const now = status.kind === 'now';
  return (
    <View style={[styles.row, now && styles.rowNow]} accessible accessibilityLabel={status.text}>
      <Ionicons
        name={now ? 'navigate' : status.kind === 'upcoming' ? 'airplane-outline' : 'checkmark-done-outline'}
        size={14}
        color={status.kind === 'past' ? theme.color.muted : theme.color.gold}
      />
      <Text style={[styles.text, status.kind === 'past' && styles.textPast]} numberOfLines={2}>{status.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, alignSelf: 'flex-start' },
  // On a trip right now: a gold-tinted pill, so it stands out.
  rowNow: { backgroundColor: theme.color.goldBadgeTint, borderRadius: theme.radius.lg, paddingHorizontal: 12, paddingVertical: 4 },
  text: { flexShrink: 1, fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  textPast: { color: theme.color.muted, fontFamily: theme.font.bodyRegular },
});
