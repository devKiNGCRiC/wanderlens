/**
 * lib/profiles.ts: profile-related helpers shared by several screens.
 *
 * Used by app/(tabs)/connect.tsx and app/(tabs)/index.tsx to drop deleted
 * accounts from "people you could connect with" lists, and by the people
 * search in new-message, create-group and group/[id] to build a safe filter.
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
/**
 * Builds the PostgREST `.or()` filter for a "username or full name contains
 * q" people search, or returns null when nothing searchable is left.
 *
 * Why: `.or()` takes one filter string, and PostgREST gives `,` `(` `)`
 * `"` and `\\` special meaning in it, while `%` and `*` are ilike wildcards.
 * Pasting raw search text in means typing e.g. "smith, j" splits the filter
 * and the request fails, or reshapes the query. Those characters never
 * appear in a username and add nothing to a name search, so they are
 * stripped. RLS still decides which rows can be returned either way.
 */
export function profileSearchFilter(q: string): string | null {
  const term = q.replace(/[,()"\\%*]/g, ' ').trim();
  if (term.length < 2) return null;
  return `username.ilike.%${term}%,full_name.ilike.%${term}%`;
}

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
