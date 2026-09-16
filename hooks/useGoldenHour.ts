import { useEffect, useState } from 'react';
import { getSunTimes, type SunTimes } from '@/lib/sunTimes';
import { computeNextLightEvent, formatLightEvent } from '@/lib/goldenHour';

export type GoldenHourDisplay = { label: string; kind: 'golden' | 'blue' };

// Live-updating "GOLDEN HOUR · 42M" style label for the feed hero. Fetches
// today's sun times once per location change, then recomputes the display
// locally every minute from the cached times (no repeated network calls) —
// only fetches "tomorrow" lazily, the one time `now` has actually passed
// today's blue hour.
export function useGoldenHour(lat: number | null, lng: number | null): GoldenHourDisplay | null {
  const [display, setDisplay] = useState<GoldenHourDisplay | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    let today: SunTimes | null = null;
    let tomorrow: SunTimes | null = null;

    async function tick() {
      if (!today) today = await getSunTimes(lat as number, lng as number, 'today');
      if (!today) {
        if (!cancelled) setDisplay(null);
        return;
      }
      const now = new Date();
      if (now.getTime() >= today.civilTwilightEnd.getTime() && !tomorrow) {
        tomorrow = await getSunTimes(lat as number, lng as number, 'tomorrow');
      }
      if (cancelled) return;
      const event = computeNextLightEvent(now, today, tomorrow ?? today);
      setDisplay({ label: formatLightEvent(event), kind: event.kind });
    }

    tick();
    const interval = setInterval(tick, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lat, lng]);

  return display;
}
