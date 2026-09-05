import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { createAudioPlayer } from 'expo-audio';

async function ensurePermission(): Promise<boolean> {
  // Write-only: we only ever save new photos, never read/list existing ones.
  // Requesting read access is what triggers Android 14's photo-picker-style
  // "select photos" grant flow, which looks like the gallery app opening.
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  return status === 'granted';
}

export async function saveRemoteMediaToGallery(uri: string, extension: string = 'jpg'): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  let localUri = uri;
  if (uri.startsWith('http')) {
    const destination = new File(Paths.cache, `wanderlens_${Date.now()}.${extension}`);
    const downloaded = await File.downloadFileAsync(uri, destination);
    localUri = downloaded.uri;
  }
  await MediaLibrary.saveToLibraryAsync(localUri);
  return true;
}

export async function saveViewAsImage(viewRef: RefObject<View | null>): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.92 });
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

// Loads just enough of a local audio file to read its duration, for a song
// picked from the document picker rather than recorded — bounded by a
// timeout so a file that never loads doesn't hang the send.
export function probeAudioDuration(uri: string, timeoutMs: number = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    const timeout = setTimeout(() => finish(null), timeoutMs);
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
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded && status.duration > 0) finish(Math.round(status.duration));
      });
    } catch {
      finish(null);
    }
  });
}
