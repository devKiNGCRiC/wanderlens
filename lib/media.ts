/**
 * lib/media.ts: saving images to the phone's gallery, snapshotting views, and
 * probing audio files.
 *
 * Used by the chat screen, image/video viewers, photo-studio, spot-camera,
 * and add-spot. No React state here; these are plain async functions.
 *
 * How it works:
 * - expo-media-library writes into the device gallery (after a permission prompt).
 * - expo-file-system downloads remote files into the cache first, because the
 *   gallery can only save a local file.
 * - react-native-view-shot's `captureRef` renders an on-screen View (e.g. a
 *   photo with overlays) to a JPEG file.
 * - expo-audio loads an audio file just long enough to read its duration.
 *
 * The save functions return false when permission is denied; other errors
 * (download or save failures) are thrown to the caller.
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { createAudioPlayer } from 'expo-audio';

/** Asks for (or confirms) gallery write permission. @returns true if granted. */
async function ensurePermission(): Promise<boolean> {
  // Write-only: we only ever save new photos, never read/list existing ones.
  // Requesting read access is what triggers Android 14's photo-picker-style
  // "select photos" grant flow, which looks like the gallery app opening.
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  return status === 'granted';
}

/**
 * Saves an image or video to the gallery, downloading it first if it's a URL.
 * @param uri A remote http(s) URL or a local file URI.
 * @param extension File extension for the downloaded copy, e.g. 'jpg' or 'mp4'.
 * @returns false if permission was denied, true once saved.
 */
export async function saveRemoteMediaToGallery(uri: string, extension: string = 'jpg'): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  let localUri = uri;
  // Remote file: download to a uniquely named file in the app's cache directory first.
  if (uri.startsWith('http')) {
    const destination = new File(Paths.cache, `wanderlens_${Date.now()}.${extension}`);
    const downloaded = await File.downloadFileAsync(uri, destination);
    localUri = downloaded.uri;
  }
  await MediaLibrary.saveToLibraryAsync(localUri);
  return true;
}

// Saves an already-local file URI directly — no view-shot compositing, so
// this preserves the file's actual resolution (e.g. a camera capture at its
// full native size) rather than whatever a screen-sized View renders at.
/** @returns false if permission was denied, true once saved. */
export async function saveLocalUriToGallery(uri: string): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

/**
 * Snapshots a mounted View as a JPEG (quality 0.92) and saves it to the gallery.
 * Output resolution follows the View's on-screen size.
 * @returns false if permission was denied, true once saved.
 */
export async function saveViewAsImage(viewRef: RefObject<View | null>): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.92 });
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

// Same capture as saveViewAsImage, but returns base64 instead of saving to
// the gallery — for uploading a composited View (e.g. a styled spot photo)
// through the same decode() -> supabase.storage.upload() path already used
// for a plain picked photo, rather than a second, divergent upload route.
/** No gallery permission needed, since nothing is written to the gallery. */
export async function captureViewAsBase64(viewRef: RefObject<View | null>): Promise<string> {
  const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.92 });
  return new File(uri).base64();
}

// Loads just enough of a local audio file to read its duration, for a song
// picked from the document picker rather than recorded — bounded by a
// timeout so a file that never loads doesn't hang the send.
/**
 * @param uri Local audio file URI.
 * @param timeoutMs Give up after this long (default 5 s).
 * @returns Duration in whole seconds, or null if it couldn't be read. Never rejects.
 */
export function probeAudioDuration(uri: string, timeoutMs: number = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    // `settled` makes finish() run once, whichever of timeout / load / error happens first.
    let settled = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    const timeout = setTimeout(() => finish(null), timeoutMs);
    // Resolves the promise and releases the native player.
    function finish(duration: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      player?.remove();
      resolve(duration);
    }
    try {
      // A corrupt/DRM-locked file, or one whose mimeType lied about being
      // audio, can throw synchronously here rather than just failing to load.
      player = createAudioPlayer(uri);
      // The player reports status updates as it loads; the first one with a
      // positive duration is all we need.
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded && status.duration > 0) finish(Math.round(status.duration));
      });
    } catch {
      finish(null);
    }
  });
}
