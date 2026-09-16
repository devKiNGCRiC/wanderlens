export type PlaceSuggestion = { id: string; label: string };

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Wanderlens/1.0 (React Native travel app)';

// OpenStreetMap's free geocoding search — no API key/billing, matching this
// project's deliberate choice to avoid Google's paid Places/Maps APIs (see
// the map tile choice in CLAUDE.md). Their usage policy asks for a
// descriptive User-Agent identifying the app, and caps interactive use
// around 1 request/second — callers must debounce, this module doesn't.
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({ q: trimmed, format: 'json', limit: '5' });
  try {
    const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { place_id: number; display_name: string }[];
    return data.map((r) => ({ id: String(r.place_id), label: r.display_name }));
  } catch {
    // Network hiccup or offline — the caller falls back to free-text entry.
    return [];
  }
}

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
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2' });
  try {
    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return { name: null, address: null };
    const data = (await res.json()) as { name?: string; display_name?: string };
    return { name: data.name || null, address: data.display_name || null };
  } catch {
    return { name: null, address: null };
  }
}

// Decimal degrees -> the traditional degrees/minutes/seconds + hemisphere
// format real GPS camera apps use ("13°02'59.9\"N"), rather than the plain
// decimal form (which stays in use elsewhere in the app, e.g. spot detail,
// where compactness for data browsing matters more than this convention).
export function formatDMS(decimal: number, axis: 'lat' | 'lng'): string {
  const direction = axis === 'lat' ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = ((minutesFull - minutes) * 60).toFixed(1);
  return `${degrees}°${minutes}'${seconds}"${direction}`;
}
