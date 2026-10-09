/**
 * lib/geocoding.ts: place search, reverse geocoding, and coordinate formatting.
 *
 * Purpose:
 * - `searchPlaces`: autocomplete for components/PlaceAutocomplete.tsx.
 * - `reverseGeocode`: coordinates to a place name/address, used by add-spot,
 *   pick-location, spot-camera, and chat location sharing.
 * - `formatDMS`: degrees/minutes/seconds display for spot-camera and spot detail.
 * - `placeDetails`: coordinates to the exact place name plus locality, state,
 *   country and PIN code, for Add Spot and the tap-to-pin map;
 *   `formatPlaceLine` / `formatDecimalCoords` display them.
 *
 * - `placeLabel` / `geocodePlace`: the "City, Region, Country" label and the
 *   typed-place search used by add-spot, pick-location and chat location
 *   sharing. They try expo-location's on-device geocoder first and fall back
 *   to Nominatim.
 *
 * Lookups use OpenStreetMap's Nominatim service over plain `fetch` (plus
 * expo-location for the two helpers above), and never throw: failures come
 * back as empty/null results.
 */
import * as Location from 'expo-location';

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

/** Joins the parts that exist into "City, Region, Country"; '' if none do. */
function joinLabel(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}

/**
 * Coordinates -> a "City, Region, Country" label, or null if both lookups fail.
 *
 * Why the fallback: on Android, expo-location's reverseGeocodeAsync throws
 * `NullPointerException: getCountryCode(...) must not be null` whenever the
 * system geocoder returns an address without a country code. Google's
 * geocoder does exactly that for disputed regions such as Arunachal Pradesh
 * (e.g. Tawang), so every lookup there failed. Nominatim's OpenStreetMap data
 * labels these places normally, so it is used when the device lookup throws
 * or returns nothing usable.
 */
export async function placeLabel(lat: number, lng: number): Promise<string | null> {
  // 1. On-device geocoder: fast, no network request of our own.
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const text = joinLabel([place?.city || place?.subregion, place?.region, place?.country]);
    if (text) return text;
  } catch {
    // Fall through to Nominatim (see the doc comment above).
  }
  // 2. Nominatim, asking for the structured `address` parts so the label keeps
  // the same short format instead of Nominatim's long display_name.
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '10' });
  try {
    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, string | undefined> };
    const a = data.address ?? {};
    // OSM uses different keys depending on the settlement's size.
    const city = a.city || a.town || a.village || a.hamlet || a.county || a.state_district;
    return joinLabel([city, a.state, a.country]) || null;
  } catch {
    return null;
  }
}

/**
 * A point's address in parts. `name` is the specific feature at that point
 * when OpenStreetMap has one ("Sela Pass", "Tawang Monastery"); the rest is
 * the surrounding address. Any part may be null.
 */
export type PlaceDetails = {
  name: string | null;
  locality: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
};

const EMPTY_DETAILS: PlaceDetails = { name: null, locality: null, district: null, state: null, country: null, postcode: null };

/**
 * Coordinates -> the exact place and its address parts, for Add Spot and
 * the tap-to-pin map. Never throws; all-null on failure.
 *
 * Unlike placeLabel this asks Nominatim FIRST and at street level (zoom 18),
 * not city level, so a pass or lake keeps its own name instead of becoming
 * the nearest town. OpenStreetMap also labels Arunachal Pradesh correctly,
 * where the Android system geocoder fails (see placeLabel). The device
 * geocoder is only the fallback when Nominatim can't be reached.
 */
export async function placeDetails(lat: number, lng: number, signal?: AbortSignal): Promise<PlaceDetails> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18' });
  try {
    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      // English names: otherwise OSM answers in the local script (Devanagari,
      // Tibetan…), which would then be saved into the spot's address fields.
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as {
        name?: string; category?: string; type?: string; addresstype?: string;
        address?: Record<string, string | undefined>;
      };
      const a = data.address ?? {};
      // OSM uses different keys depending on the settlement's size.
      const locality = a.village || a.town || a.city || a.hamlet || a.suburb || null;
      const details: PlaceDetails = {
        name: isPlaceLikeName(data) ? data.name! : null,
        locality,
        district: a.state_district || a.county || null,
        state: a.state || null,
        country: a.country || null,
        postcode: a.postcode || null,
      };
      if (details.state || details.country) return details;
    }
  } catch {
    // Aborted (a newer lookup replaced this one) or offline.
    if (signal?.aborted) return EMPTY_DETAILS;
    // Otherwise fall through to the device geocoder.
  }
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (p) {
      return {
        // The device geocoder's `name` is usually a street address or house
        // number on Android, not a place name, so it is never used as one.
        name: null,
        locality: p.city || null,
        district: p.subregion || p.district || null,
        state: p.region || null,
        country: p.country || null,
        postcode: p.postalCode || null,
      };
    }
  } catch {
    // Android throws for some regions (see placeLabel); nothing more to try.
  }
  return EMPTY_DETAILS;
}

// OSM results whose `name` is a road, a building or an address, not a
// place a photographer would call the spot.
const NON_PLACE_CATEGORIES = new Set(['highway', 'building', 'office', 'shop', 'craft']);
const NON_PLACE_TYPES = new Set(['house', 'road', 'residential', 'yes', 'postcode']);

/** True when a Nominatim result's `name` is worth offering as the place name. */
function isPlaceLikeName(r: { name?: string; category?: string; type?: string; addresstype?: string }): boolean {
  if (!r.name || /^\d/.test(r.name)) return false;
  if (r.category && NON_PLACE_CATEGORIES.has(r.category)) return false;
  if ((r.type && NON_PLACE_TYPES.has(r.type)) || (r.addresstype && NON_PLACE_TYPES.has(r.addresstype))) return false;
  return true;
}

/** "Tawang · Arunachal Pradesh · India · PIN 790104", skipping missing parts; '' if none. */
export function formatPlaceLine(d: Pick<PlaceDetails, 'locality' | 'state' | 'country' | 'postcode'>): string {
  return [d.locality, d.state, d.country, d.postcode ? `PIN ${d.postcode}` : null].filter(Boolean).join(' · ');
}

/**
 * "Sela Pass, Tawang, Arunachal Pradesh, India" for spots.location_label.
 * Parts already in the name (a place named after its town) aren't repeated,
 * compared case-insensitively.
 */
export function composeLocationLabel(name: string, d: Pick<PlaceDetails, 'locality' | 'state' | 'country'>): string {
  const parts = [name, d.locality, d.state, d.country].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i).join(', ');
}

/** "27.50421° N, 92.10372° E": decimal degrees to 5 places (about 1 m). */
export function formatDecimalCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

/**
 * Typed place name -> the coordinates of the best match, or null if nothing
 * was found. Same two-step approach as placeLabel: the on-device geocoder
 * first, then Nominatim when it throws or finds nothing.
 */
export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const [hit] = await Location.geocodeAsync(q);
    if (hit) return { lat: hit.latitude, lng: hit.longitude };
  } catch {
    // Fall through to Nominatim.
  }
  const params = new URLSearchParams({ q, format: 'json', limit: '1' });
  try {
    const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    // Nominatim returns coordinates as strings.
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
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
