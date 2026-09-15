export type CurrentWeather = { tempC: number; condition: string };

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes, condensed to short labels — https://open-meteo.com/en/docs
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
export async function getCurrentWeather(lat: number, lng: number): Promise<CurrentWeather | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'temperature_2m,weather_code',
    });
    const res = await fetch(`${WEATHER_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data?.current;
    if (typeof current?.temperature_2m !== 'number') return null;
    return { tempC: current.temperature_2m, condition: conditionFor(current.weather_code ?? -1) };
  } catch {
    return null;
  }
}
