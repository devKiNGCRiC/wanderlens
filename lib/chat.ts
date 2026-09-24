/**
 * lib/chat.ts: small non-React helpers used by the chat screens.
 *
 * Used by app/chat/[id].tsx and components/chat/MessageSearchOverlay.tsx.
 */
import { Linking, Platform } from 'react-native';

/**
 * Creates a random id on the device, used by app/chat/[id].tsx as a message's
 * `client_generated_id` when sending (a retry reuses the original id). Uses `crypto.randomUUID()` when the JS runtime provides it,
 * otherwise a timestamp + random-string fallback (unique enough for this
 * purpose, but not a real UUID).
 */
export function generateClientId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Opens a coordinate (e.g. a shared location message) in the platform's
 * maps app: Apple Maps on iOS, the `geo:` intent on Android (lets the user
 * pick an app), and a Google Maps web URL elsewhere. Failures are ignored.
 */
export function openInMaps(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps:0,0?q=${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}`,
    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  });
  if (url) Linking.openURL(url).catch(() => {});
}
