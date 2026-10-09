/**
 * lib/spotPhotos.ts: reading, uploading and removing a spot's photos.
 *
 * A spot has 1–10 photos in the `spot_photos` table; position 0 is the hero,
 * which is also copied onto `spots.photo_url` so older readers (map pins,
 * nearby_spots, saved, chat) keep working. Spots posted before multi-photo
 * existed have no rows, so `photosFor` falls back to `spots.photo_url`.
 *
 * Used by app/add-spot.tsx (upload), the Feed and Spot Detail (carousel),
 * and the spot delete flows (file clean-up).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

/** Hard cap, matched by the `position between 0 and 9` check in the migration. */
export const MAX_SPOT_PHOTOS = 10;

// Long edge of an uploaded photo. Plenty for a full-width phone screen while
// keeping each file around 300–500 KB on mobile data.
const MAX_EDGE = 1600;

/** One carousel photo. width/height are null for the legacy fallback. */
export type SpotPhoto = { photo_url: string; width: number | null; height: number | null };

/** A photo already in the `spot-photos` bucket, ready to be recorded in `spot_photos`. */
export type UploadedPhoto = { storage_path: string; photo_url: string; width: number; height: number };

type SpotPhotoRow = { spot_id: string; storage_path: string; width: number; height: number };

/** Public URL of a spot-photos object. Built locally, no network call. */
function publicUrl(storagePath: string): string {
  return supabase.storage.from('spot-photos').getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Loads the photos for many spots in one request (the whole feed at once,
 * not one call per post).
 * @returns Photos grouped by spot id, in position order. Spots with no rows
 * are simply absent; on error the map is empty and callers fall back to the hero.
 */
export async function fetchSpotPhotos(spotIds: string[]): Promise<Map<string, SpotPhoto[]>> {
  const bySpot = new Map<string, SpotPhoto[]>();
  if (spotIds.length === 0) return bySpot;
  const { data, error } = await supabase
    .from('spot_photos')
    .select('spot_id, storage_path, width, height')
    .in('spot_id', spotIds)
    .order('position');
  if (error || !data) return bySpot;
  for (const row of data as SpotPhotoRow[]) {
    const list = bySpot.get(row.spot_id) ?? [];
    list.push({ photo_url: publicUrl(row.storage_path), width: row.width, height: row.height });
    bySpot.set(row.spot_id, list);
  }
  return bySpot;
}

/** The spot's photos, or just its hero for a spot posted before multi-photo. */
export function photosFor(bySpot: Map<string, SpotPhoto[]>, spot: { id: string; photo_url: string | null }): SpotPhoto[] {
  const rows = bySpot.get(spot.id);
  if (rows && rows.length > 0) return rows;
  return spot.photo_url ? [{ photo_url: spot.photo_url, width: null, height: null }] : [];
}

/**
 * Shrinks a local photo to at most `maxEdge` on its long side (never
 * upscaling) and re-encodes it as JPEG.
 * @param size The photo's pixel size if already known (the library picker
 * reports it). Saves a full-resolution decode, which matters for ten 48 MP
 * photos on a low-memory phone. Without it the size is probed first.
 * @returns base64 plus the final pixel size.
 */
export async function resizeToJpeg(uri: string, maxEdge: number, size?: { width: number; height: number }): Promise<{ base64: string; width: number; height: number }> {
  let known = size;
  let probe: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | null = null;
  if (!known) {
    probe = await ImageManipulator.manipulate(uri).renderAsync();
    known = { width: probe.width, height: probe.height };
  }
  const needsResize = Math.max(known.width, known.height) > maxEdge;
  let rendered = probe;
  if (needsResize || !rendered) {
    // A fresh context, rather than re-rendering one that has already rendered.
    const context = ImageManipulator.manipulate(uri);
    if (needsResize) context.resize(known.width >= known.height ? { width: maxEdge, height: null } : { width: null, height: maxEdge });
    rendered = await context.renderAsync();
    // The full-size probe bitmap is no longer needed; free it now rather than at GC.
    probe?.release();
  }
  try {
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    if (!result.base64) throw new Error('Could not prepare the photo.');
    return { base64: result.base64, width: result.width, height: result.height };
  } finally {
    rendered.release();
  }
}

/**
 * Resizes a local photo (see resizeToJpeg) and uploads it to the user's
 * folder in `spot-photos`.
 * @param userId Owner; the bucket's insert policy only allows their own folder.
 * @param uri Local file URI from the picker or the geo-tag camera.
 * @param index Position in the post, used to keep file names unique.
 */
export async function uploadSpotPhoto(userId: string, uri: string, index: number, size?: { width: number; height: number }): Promise<UploadedPhoto> {
  const result = await resizeToJpeg(uri, MAX_EDGE, size);

  const storagePath = `${userId}/${Date.now()}_${index}.jpg`;
  const { error } = await supabase.storage
    .from('spot-photos')
    .upload(storagePath, decode(result.base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  return { storage_path: storagePath, photo_url: publicUrl(storagePath), width: result.width, height: result.height };
}

// Marker in a public spot-photos URL; everything after it is the object key.
const PUBLIC_PREFIX = '/storage/v1/object/public/spot-photos/';

/** Object key from a public spot-photos URL, or null for any other URL. */
export function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const at = url.indexOf(PUBLIC_PREFIX);
  return at === -1 ? null : decodeURIComponent(url.slice(at + PUBLIC_PREFIX.length));
}

/**
 * Every storage key a spot owns, read before the spot is deleted (the
 * spot_photos rows cascade away with it): its spot_photos files, plus the
 * styled cover and, for spots posted before multi-photo, the hero from
 * `spots.photo_url`. Deduplicated, since the hero is usually both.
 */
export async function fetchSpotStoragePaths(spotId: string): Promise<string[]> {
  const [photosRes, spotRes] = await Promise.all([
    supabase.from('spot_photos').select('storage_path').eq('spot_id', spotId),
    supabase.from('spots').select('photo_url, styled_photo_url').eq('id', spotId).maybeSingle(),
  ]);
  const paths = new Set<string>((photosRes.data ?? []).map((row: { storage_path: string }) => row.storage_path));
  for (const url of [spotRes.data?.photo_url ?? null, spotRes.data?.styled_photo_url ?? null]) {
    const path = pathFromPublicUrl(url);
    if (path) paths.add(path);
  }
  return [...paths];
}

/**
 * Best-effort removal of files from `spot-photos`. Never throws: a leftover
 * file costs storage but must not turn a successful delete into an error.
 */
export async function removeSpotFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('spot-photos').remove(paths);
  if (error) console.warn('spot-photos cleanup failed', error.message);
}

/** One stored photo of a spot, as the edit screen needs it (with its storage key). */
export type SpotPhotoRecord = { storage_path: string; photo_url: string; width: number; height: number };

/** A spot's photos in order (cover first), with storage keys; empty for spots posted before multi-photo or on error. */
export async function fetchSpotPhotoRecords(spotId: string): Promise<SpotPhotoRecord[]> {
  const { data, error } = await supabase
    .from('spot_photos')
    .select('storage_path, width, height')
    .eq('spot_id', spotId)
    .order('position');
  if (error || !data) return [];
  return (data as { storage_path: string; width: number; height: number }[]).map((r) => ({ ...r, photo_url: publicUrl(r.storage_path) }));
}

/**
 * A local file URI for `uri`: downloads a remote photo (an existing spot's,
 * when editing) into the cache first, since the image manipulator works on
 * local files. Local URIs are returned as they are.
 */
export async function toLocalUri(uri: string): Promise<string> {
  if (!uri.startsWith('http')) return uri;
  const cached = localCopies.get(uri);
  if (cached) return cached;
  const destination = new File(Paths.cache, `wanderlens_edit_${Date.now()}.jpg`);
  const downloaded = await File.downloadFileAsync(uri, destination);
  localCopies.set(uri, downloaded.uri);
  return downloaded.uri;
}

// Remote URL -> its downloaded copy, so the style preview and the AI
// caption don't download the same cover again (the cache dir is OS-managed).
const localCopies = new Map<string, string>();

/** Uploads a styled cover (base64 JPEG) to the user's folder. */
export async function uploadStyledCover(userId: string, base64: string): Promise<{ storage_path: string; photo_url: string }> {
  const storagePath = `${userId}/${Date.now()}_styled.jpg`;
  const { error } = await supabase.storage
    .from('spot-photos')
    .upload(storagePath, decode(base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  return { storage_path: storagePath, photo_url: publicUrl(storagePath) };
}
