/**
 * lib/spotDraft.ts: the pure decisions behind saving a spot's photos and style.
 *
 * Kept free of Supabase and React so they can be unit-tested
 * (__tests__/spotDraft-test.ts). lib/spotSave.ts does the actual saving.
 */

/**
 * A photo in the Add/Edit Spot form. A photo already stored on the spot has
 * a `storagePath` (its key in the bucket) and its public URL as `uri`; a
 * newly picked one has neither and is uploaded on save.
 */
export type DraftPhoto = { uri: string; width: number | null; height: number | null; storagePath?: string };

/**
 * Photo-style settings; `key` is a PhotoStyleKey ('none' = no style).
 * `removeOld`: the user asked to remove a style from before style settings
 * were saved (it can't be re-applied, only kept or removed).
 */
export type DraftStyle = { key: string; caption: string; font: string; removeOld?: boolean };

/** The photos that still need uploading, with their position in the post. */
export function newPhotos(photos: DraftPhoto[]): { photo: DraftPhoto; index: number }[] {
  return photos.map((photo, index) => ({ photo, index })).filter(({ photo }) => !photo.storagePath);
}

/** Storage keys that were on the spot before and aren't in the final list: their files can go. */
export function droppedPaths(originalPaths: string[], finalPaths: string[]): string[] {
  const keep = new Set(finalPaths);
  return originalPaths.filter((p) => !keep.has(p));
}

/**
 * What to do with the styled cover when saving an edit.
 * - 'render': draw the chosen style over the (possibly new) cover and upload it.
 * - 'clear': remove the styled copy (style set to none).
 * - 'keep': leave the existing styled copy (or the lack of one) as it is.
 *
 * Spots styled before style settings were stored have a styled copy but no
 * `original.key`. Their style can't be re-applied, so it is kept while the
 * cover is unchanged and the user hasn't picked a new style or asked to
 * remove it (`removeOld`), and dropped if the cover changes.
 */
export function styleAction(args: {
  draft: DraftStyle;
  original: { key: string | null; caption: string | null; font: string | null };
  hadStyledCopy: boolean;
  coverChanged: boolean;
}): 'render' | 'clear' | 'keep' {
  const { draft, original, hadStyledCopy, coverChanged } = args;
  const legacy = hadStyledCopy && !original.key;
  if (draft.key === 'none') {
    if (legacy) return coverChanged || draft.removeOld ? 'clear' : 'keep';
    return hadStyledCopy ? 'clear' : 'keep';
  }
  if (!hadStyledCopy || coverChanged) return 'render';
  const changed = draft.key !== original.key || draft.caption !== (original.caption ?? '') || draft.font !== (original.font ?? '');
  return changed ? 'render' : 'keep';
}
