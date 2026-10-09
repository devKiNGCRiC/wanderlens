/**
 * lib/reuseUnchanged.ts: keep object identity across list refreshes.
 *
 * Used by the Feed (app/(tabs)/index.tsx). Each refresh returns brand-new
 * row objects even when nothing changed, which would make every memoized
 * FeedPostCard re-render. These helpers hand back the PREVIOUS object for
 * any row that is unchanged, so React.memo can skip it. Pure functions, no
 * React or network.
 */
import type { SpotPhoto } from '@/lib/spotPhotos';

/**
 * The new rows, but reusing the previous object for any row (matched by id)
 * whose fields are all strictly equal. Order follows `next`.
 */
export function reuseUnchangedRows<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const byId = new Map(prev.map((row) => [row.id, row]));
  return next.map((row) => {
    const old = byId.get(row.id);
    if (!old) return row;
    const keys = Object.keys(row) as (keyof T)[];
    const sameShape = keys.length === Object.keys(old).length;
    return sameShape && keys.every((k) => old[k] === row[k]) ? old : row;
  });
}

/** The new photo map, reusing the previous array for any spot whose photo URLs are unchanged and in the same order. */
export function reuseUnchangedPhotos(prev: Map<string, SpotPhoto[]>, next: Map<string, SpotPhoto[]>): Map<string, SpotPhoto[]> {
  const out = new Map<string, SpotPhoto[]>();
  next.forEach((list, id) => {
    const old = prev.get(id);
    const same = !!old && old.length === list.length && old.every((ph, i) => ph.photo_url === list[i].photo_url);
    out.set(id, same ? old! : list);
  });
  return out;
}
