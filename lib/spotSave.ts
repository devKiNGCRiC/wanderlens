/**
 * lib/spotSave.ts: creating and updating a spot, photos and all.
 *
 * Used by app/add-spot.tsx in both its modes (new spot, and edit with
 * `?editId=`). Plain async functions, no React: the screen passes a
 * `renderStyled` callback for the one step that needs a mounted View (the
 * styled-cover snapshot) and an `onProgress` callback for "Uploading 3/7…".
 *
 * Both are all-or-nothing from the user's point of view:
 * - createSpot: on failure the spot row and every uploaded file are removed.
 * - updateSpot: on failure the spot keeps its old photos, text and files;
 *   only files uploaded during this attempt are removed. Files the edit
 *   dropped are deleted only after everything has saved.
 */
import { supabase } from '@/lib/supabase';
import { composeLocationLabel, type PlaceDetails } from '@/lib/geocoding';
import { uploadSpotPhoto, uploadStyledCover, removeSpotFiles, pathFromPublicUrl, type UploadedPhoto } from '@/lib/spotPhotos';
import { newPhotos, droppedPaths, styleAction, type DraftPhoto, type DraftStyle } from '@/lib/spotDraft';
import type { CapturedPhoto } from '@/store/spotCamera';

export type SpotDraft = {
  title: string;
  description: string;
  bestTime: string;
  genre: string;
  timeOfDay: string | null;
  photos: DraftPhoto[];
  location: { lat: number; lng: number; details: PlaceDetails };
  placeName: string;
  style: DraftStyle;
};

/** What the spot looked like when the edit screen opened. */
export type OriginalSpot = {
  // Ordered storage keys of its photos (legacy spots: just the cover's key).
  photoPaths: string[];
  // Its spot_photos rows as they were (empty for a spot posted before
  // multi-photo), so a failed save can put them back exactly.
  photoRows: { storage_path: string; width: number; height: number }[];
  styledPhotoUrl: string | null;
  style: { key: string | null; caption: string | null; font: string | null };
};

type Hooks = {
  // Snapshot of the on-screen styled cover as base64 JPEG.
  renderStyled: () => Promise<string>;
  onProgress: (done: number, total: number) => void;
};

/** The spots columns both modes write: text, location, place and style settings. */
function sharedColumns(d: SpotDraft) {
  const name = d.placeName.trim();
  return {
    title: d.title,
    description: d.description || null,
    best_time: d.bestTime || null,
    genre: d.genre,
    time_of_day: d.timeOfDay,
    // EWKT text, which PostGIS parses into the geography column. Longitude first.
    location: `SRID=4326;POINT(${d.location.lng} ${d.location.lat})`,
    place_name: name,
    place_locality: d.location.details.locality,
    place_district: d.location.details.district,
    place_state: d.location.details.state,
    place_country: d.location.details.country,
    place_postcode: d.location.details.postcode,
    // Composed for every older reader (map card, chat spot-shares, trail generator).
    location_label: composeLocationLabel(name, d.location.details),
    photo_style: d.style.key === 'none' ? null : d.style.key,
    style_caption: d.style.key === 'none' ? null : d.style.caption || null,
    style_caption_font: d.style.key === 'none' ? null : d.style.font,
  };
}

/** Uploads the draft's new photos one by one (gentler on mobile data), recording each path for rollback. */
async function uploadNew(userId: string, photos: DraftPhoto[], uploadedPaths: string[], onProgress: Hooks['onProgress']) {
  const pending = newPhotos(photos);
  const byIndex = new Map<number, UploadedPhoto>();
  for (let i = 0; i < pending.length; i++) {
    onProgress(i, pending.length);
    const { photo, index } = pending[i];
    const size = photo.width && photo.height ? { width: photo.width, height: photo.height } : undefined;
    const uploaded = await uploadSpotPhoto(userId, photo.uri, index, size);
    uploadedPaths.push(uploaded.storage_path);
    byIndex.set(index, uploaded);
  }
  return byIndex;
}

/**
 * Posts a new spot. Throws on failure, after removing anything it created.
 * @returns The new spot's id.
 */
export async function createSpot(userId: string, draft: SpotDraft, capture: CapturedPhoto | null, hooks: Hooks): Promise<string> {
  const uploadedPaths: string[] = [];
  let spotId: string | null = null;
  try {
    const byIndex = await uploadNew(userId, draft.photos, uploadedPaths, hooks.onProgress);
    const final = draft.photos.map((_, i) => byIndex.get(i)!);

    let styledPhotoUrl: string | null = null;
    if (draft.style.key !== 'none') {
      const styled = await uploadStyledCover(userId, await hooks.renderStyled());
      uploadedPaths.push(styled.storage_path);
      styledPhotoUrl = styled.photo_url;
    }

    // Writes go straight to tables; the capture_* and weather_* columns are
    // only filled for photos from the in-app camera.
    const { data: row, error } = await supabase.from('spots').insert({
      ...sharedColumns(draft),
      photo_url: final[0].photo_url,
      styled_photo_url: styledPhotoUrl,
      capture_lat: capture?.lat ?? null,
      capture_lng: capture?.lng ?? null,
      capture_altitude: capture?.altitude ?? null,
      captured_at: capture?.capturedAt ?? null,
      capture_place_name: capture?.placeName ?? null,
      capture_address: capture?.address ?? null,
      weather_temp_c: capture?.weatherTempC ?? null,
      weather_condition: capture?.weatherCondition ?? null,
      created_by: userId,
    }).select('id').single();
    if (error) throw error;
    spotId = row.id as string;

    const { error: photosError } = await supabase.from('spot_photos').insert(
      final.map((p, position) => ({ spot_id: spotId, position, storage_path: p.storage_path, width: p.width, height: p.height }))
    );
    if (photosError) throw photosError;
    return spotId;
  } catch (err) {
    // Deleting the spot cascades to any spot_photos rows; then the files go.
    if (spotId) await supabase.from('spots').delete().eq('id', spotId);
    await removeSpotFiles(uploadedPaths);
    throw err;
  }
}

/**
 * Saves an edit. Throws on failure, leaving the spot as it was: the fields
 * and the photo list change in one database transaction (save_spot_edit),
 * so the only thing to undo on failure is this attempt's uploads. Files the
 * edit dropped are deleted only after the save has gone through.
 * The server enforces ownership and the 2 km move limit (20260947000000_edit_spot.sql).
 */
export async function updateSpot(userId: string, spotId: string, draft: SpotDraft, original: OriginalSpot, hooks: Hooks): Promise<void> {
  const uploadedPaths: string[] = [];
  try {
    const byIndex = await uploadNew(userId, draft.photos, uploadedPaths, hooks.onProgress);
    // Final ordered list: stored photos keep their key, new ones use the upload.
    const final = draft.photos.map((p, i) => {
      if (p.storagePath && p.width && p.height) {
        return { storage_path: p.storagePath, photo_url: p.uri, width: p.width, height: p.height };
      }
      if (p.storagePath) throw new Error('A photo is missing its size; reopen the editor and try again.');
      return byIndex.get(i)!;
    });

    const originalStyledPath = pathFromPublicUrl(original.styledPhotoUrl);
    const action = styleAction({
      draft: draft.style,
      original: original.style,
      hadStyledCopy: !!original.styledPhotoUrl,
      coverChanged: final[0].storage_path !== original.photoPaths[0],
    });
    let styledPhotoUrl = original.styledPhotoUrl;
    if (action === 'clear') styledPhotoUrl = null;
    if (action === 'render') {
      const styled = await uploadStyledCover(userId, await hooks.renderStyled());
      uploadedPaths.push(styled.storage_path);
      styledPhotoUrl = styled.photo_url;
    }

    const columns = sharedColumns(draft);
    // An older style kept as is has no settings to store.
    if (action === 'keep' && !original.style.key) {
      columns.photo_style = null;
      columns.style_caption = null;
      columns.style_caption_font = null;
    }
    const { data: dropped, error } = await supabase.rpc('save_spot_edit', {
      p_spot_id: spotId,
      p_fields: { ...columns, photo_url: final[0].photo_url, styled_photo_url: styledPhotoUrl },
      p_photos: final.map(({ storage_path, width, height }) => ({ storage_path, width, height })),
    });
    if (error) throw error;

    // Saved. Now remove files nothing points at any more: what the server
    // dropped, the old cover of a spot posted before multi-photo (it had no
    // spot_photos row for the server to report), and a replaced styled copy.
    const stale = new Set<string>((dropped as string[] | null) ?? []);
    if (original.photoRows.length === 0) {
      droppedPaths(original.photoPaths, final.map((p) => p.storage_path)).forEach((path) => stale.add(path));
    }
    if (originalStyledPath && styledPhotoUrl !== original.styledPhotoUrl) stale.add(originalStyledPath);
    await removeSpotFiles([...stale]);
  } catch (err) {
    // The transaction didn't commit, so the spot still uses only its old
    // files: removing this attempt's uploads is all the cleanup needed.
    await removeSpotFiles(uploadedPaths);
    throw err;
  }
}
