/**
 * lib/sunTimes.ts: fetches sunrise, sunset, and civil-twilight times for a location.
 *
 * Used by hooks/useGoldenHour.ts; the times feed lib/goldenHour.ts. Never
 * throws: any failure returns null.
 */

/**
 * The four daily boundaries Wanderlens uses, as absolute instants.
 * Civil twilight begin/end bracket the morning and evening blue hours.
 */
export type SunTimes = {
  sunrise: Date;
  sunset: Date;
  civilTwilightBegin: Date;
  civilTwilightEnd: Date;
};

const SUNRISE_SUNSET_URL = 'https://api.sunrise-sunset.org/v2';

// Free, no API key — https://sunrise-sunset.org/api. Same no-paid-API
// pattern as the weather/geocoding lookups already in this app (Open-Meteo,
// Nominatim). `formatted=0` returns ISO 8601 timestamps with their UTC
// offset embedded, so `new Date(...)` parses them into the correct absolute
// instant regardless of the device's own timezone — no manual TZ math.
/**
 * @param date Which day to fetch; the API accepts the words 'today' and 'tomorrow'.
 * @returns The four times, or null on network error, bad status, or missing fields.
 */
export async function getSunTimes(lat: number, lng: number, date: 'today' | 'tomorrow' = 'today'): Promise<SunTimes | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), date, formatted: '0' });
    const res = await fetch(`${SUNRISE_SUNSET_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    // Defensive: this API has historically wrapped results under a
    // `results` key alongside a `status` field — tolerate either that or a
    // flat shape rather than assuming one.
    if (json.status && json.status !== 'OK') return null;
    const r = json.results ?? json;
    // All four fields are required; a partial response is treated as a failure.
    if (!r.sunrise || !r.sunset || !r.civil_twilight_begin || !r.civil_twilight_end) return null;
    return {
      sunrise: new Date(r.sunrise),
      sunset: new Date(r.sunset),
      civilTwilightBegin: new Date(r.civil_twilight_begin),
      civilTwilightEnd: new Date(r.civil_twilight_end),
    };
  } catch {
    return null;
  }
}
