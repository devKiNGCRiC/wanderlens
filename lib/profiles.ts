import { supabase } from '@/lib/supabase';

// Filters out anonymized/deleted accounts from a list of candidate profiles
// (RPC results like discover_people/nearby_photographers don't know about
// `deleted_at` — it was added after those untracked legacy RPCs, and can't
// be wired into them without their source). A deleted user's profile row
// stays (spots/messages stay attributed to "Deleted user" by design), so
// this only matters for surfaces suggesting someone as a NEW connection —
// existing Requests/Connections/chat history showing "Deleted user" is
// correct and untouched by this.
export async function excludeDeletedProfiles<T extends { id: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('id', rows.map((r) => r.id))
    .not('deleted_at', 'is', null);
  const deletedIds = new Set((data ?? []).map((r) => r.id));
  return rows.filter((r) => !deletedIds.has(r.id));
}
