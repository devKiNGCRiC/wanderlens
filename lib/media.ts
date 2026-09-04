import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';

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
