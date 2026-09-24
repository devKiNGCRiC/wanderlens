/**
 * lib/profiles.ts: profile-related helpers shared by several screens.
 *
 * Used by app/(tabs)/connect.tsx and app/(tabs)/index.tsx to drop deleted
 * accounts from "people you could connect with" lists.
 */
import { supabase } from '@/lib/supabase';

// Filters out anonymized/deleted accounts from a list of candidate profiles
// (RPC results like discover_people/nearby_photographers don't know about
// `deleted_at` — it was added after those untracked legacy RPCs, and can't
// be wired into them without their source). A deleted user's profile row
// stays (spots/messages stay attributed to "Deleted user" by design), so
// this only matters for surfaces suggesting someone as a NEW connection —
// existing Requests/Connections/chat history showing "Deleted user" is
// correct and untouched by this.
/**
 * Makes one extra `profiles` query for all candidate ids at once (not one per row).
 * @param rows Any rows with an `id` that is a profile id.
 * @returns The same rows, in the same order, minus those whose profile has `deleted_at` set.
 * Gotcha: the query's `error` is not checked; on failure `data` is null, so
 * nothing is filtered and all rows are returned.
 */
export async function excludeDeletedProfiles<T extends { id: string }>(rows: T[]): Promise<T[]> {
  // Nothing to check; skip the network call.
  if (rows.length === 0) return rows;
  // Fetch only the ids among `rows` whose `deleted_at` is NOT null (i.e. deleted accounts).
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('id', rows.map((r) => r.id))
    .not('deleted_at', 'is', null);
  const deletedIds = new Set((data ?? []).map((r) => r.id));
  return rows.filter((r) => !deletedIds.has(r.id));
}
