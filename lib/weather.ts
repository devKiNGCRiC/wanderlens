/**
 * lib/weather.ts: current temperature and a short weather label for a location.
 *
 * Used by app/spot-camera.tsx to stamp a photo capture with the conditions at
 * the time it was taken. Never throws: any failure returns null.
 */

/** Current conditions: temperature in Celsius and a short human label. */
export type CurrentWeather = { tempC: number; condition: string };

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes, condensed to short labels — https://open-meteo.com/en/docs
/**
 * Maps a WMO weather code to a label. Codes not matched by any range
 * (including the -1 used for a missing code) fall through to 'Overcast'.
 */
function conditionFor(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Overcast';
}

// Open-Meteo — free, no API key/billing, same reasoning as this project's
// OpenFreeMap tile choice and the Nominatim place autocomplete. Never
// throws: weather is a nice-to-have on top of a photo capture, not
// something that should ever fail the capture itself.
/** @returns Current weather, or null on any failure or missing temperature. */
export async function getCurrentWeather(lat: number, lng: number): Promise<CurrentWeather | null> {
  try {
    // Ask only for the two "current" fields we display.
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'temperature_2m,weather_code',
    });
    const res = await fetch(`${WEATHER_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data?.current;
    // Temperature is the one required field; without it there's nothing to show.
    if (typeof current?.temperature_2m !== 'number') return null;
    return { tempC: current.temperature_2m, condition: conditionFor(current.weather_code ?? -1) };
  } catch {
    return null;
  }
}
