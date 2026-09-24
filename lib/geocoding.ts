/**
 * lib/geocoding.ts: place search, reverse geocoding, and coordinate formatting.
 *
 * Purpose:
 * - `searchPlaces`: autocomplete for components/PlaceAutocomplete.tsx.
 * - `reverseGeocode`: coordinates to a place name/address, used by add-spot,
 *   pick-location, spot-camera, and chat location sharing.
 * - `formatDMS`: degrees/minutes/seconds display for spot-camera and spot detail.
 *
 * All lookups use OpenStreetMap's Nominatim service over plain `fetch`, and
 * never throw: failures come back as empty/null results.
 */

/** One autocomplete suggestion: Nominatim's place id and its full display name. */
export type PlaceSuggestion = { id: string; label: string };

// Nominatim endpoints and the identifying User-Agent their usage policy requires.
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Wanderlens/1.0 (React Native travel app)';

// OpenStreetMap's free geocoding search — no API key/billing, matching this
// project's deliberate choice to avoid Google's paid Places/Maps APIs (see
// the map tile choice in CLAUDE.md). Their usage policy asks for a
// descriptive User-Agent identifying the app, and caps interactive use
// around 1 request/second — callers must debounce, this module doesn't.
/**
 * @param query Free text typed by the user.
 * @returns Up to 5 suggestions; empty for queries under 2 characters or on failure.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  // Skip the network call for empty or one-letter input.
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({ q: trimmed, format: 'json', limit: '5' });
  try {
    const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return [];
    // Only the two fields we use are typed; Nominatim returns many more.
    const data = (await res.json()) as { place_id: number; display_name: string }[];
    return data.map((r) => ({ id: String(r.place_id), label: r.display_name }));
  } catch {
    // Network hiccup or offline — the caller falls back to free-text entry.
    return [];
  }
}

/** Result of a reverse lookup; either field may be null (see reverseGeocode). */
export type ReverseGeocodeResult = { name: string | null; address: string | null };

// Coordinates -> a human place name AND its full formatted address, for the
// geo-tag camera's capture location. `name` is the specific named feature
// ("Marina Beach") when Nominatim's OSM data has one — often null for
// coordinates with no notable POI. `address` is always the full formatted
// address when the lookup succeeds, independent of whether a name was
// found, so a landmark name and its street address can both be shown
// rather than one silently replacing the other. expo-location's on-device
// reverse geocoder (used elsewhere in this app for the general spot
// location) only returns a City/Region/Country style label, not named
// points of interest — Nominatim's OSM-backed data resolves landmarks far
// more often.
/** @returns `{ name, address }`, both null on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  // `jsonv2` is Nominatim's newer JSON format, which includes the `name` field.
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2' });
  try {
    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return { name: null, address: null };
    const data = (await res.json()) as { name?: string; display_name?: string };
    // `||` also turns an empty-string name into null.
    return { name: data.name || null, address: data.display_name || null };
  } catch {
    return { name: null, address: null };
  }
}

// Decimal degrees -> the traditional degrees/minutes/seconds + hemisphere
// format real GPS camera apps use ("13°02'59.9\"N"), rather than the plain
// decimal form (which stays in use elsewhere in the app, e.g. spot detail,
// where compactness for data browsing matters more than this convention).
/**
 * @param decimal Latitude or longitude in decimal degrees (negative = S/W).
 * @param axis Which hemisphere letters to use: N/S for 'lat', E/W for 'lng'.
 */
export function formatDMS(decimal: number, axis: 'lat' | 'lng'): string {
  const direction = axis === 'lat' ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  // Work with the absolute value; the sign is already captured in `direction`.
  const abs = Math.abs(decimal);
  // Whole degrees, then the fractional part x 60 gives minutes, and its fraction x 60 gives seconds.
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = ((minutesFull - minutes) * 60).toFixed(1);
  return `${degrees}°${minutes}'${seconds}"${direction}`;
}
