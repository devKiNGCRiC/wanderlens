/**
 * useGoldenHour: live "next golden/blue hour" label for the Feed tab hero.
 *
 * Purpose: gives photographers a glanceable countdown to the next good light,
 * e.g. "GOLDEN HOUR · 42M" or "BLUE HOUR · 12M LEFT". Used by
 * app/(tabs)/index.tsx with the user's coordinates from useUserLocation.
 *
 * How it works:
 * - Fetches sun times from lib/sunTimes.ts (sunrise-sunset.org).
 * - Computes the current/next light window with lib/goldenHour.ts.
 * - Re-computes every 60 s from the cached times.
 */
import { useEffect, useState } from 'react';
import { getSunTimes, type SunTimes } from '@/lib/sunTimes';
import { computeNextLightEvent, formatLightEvent } from '@/lib/goldenHour';

/** What the hero renders: the text label and which palette (golden or blue) to style it with. */
export type GoldenHourDisplay = { label: string; kind: 'golden' | 'blue' };

// Live-updating "GOLDEN HOUR · 42M" style label for the feed hero. Fetches
// today's sun times once per location change, then recomputes the display
// locally every minute from the cached times (no repeated network calls) —
// only fetches "tomorrow" lazily, the one time `now` has actually passed
// today's blue hour.
/**
 * @param lat Latitude, or null while location is unknown.
 * @param lng Longitude, or null while location is unknown.
 * @returns The display, or null when there's no location or the sun-times fetch failed.
 */
export function useGoldenHour(lat: number | null, lng: number | null): GoldenHourDisplay | null {
  const [display, setDisplay] = useState<GoldenHourDisplay | null>(null);

  // Restarts (fresh cache, new interval) whenever the coordinates change.
  useEffect(() => {
    // No location yet: render nothing.
    if (lat == null || lng == null) return;
    // `cancelled` stops a slow fetch from setting state after cleanup.
    let cancelled = false;
    // Cached sun times for this location; local variables, so they reset with the effect.
    let today: SunTimes | null = null;
    let tomorrow: SunTimes | null = null;

    // One update: fetch what's missing, then recompute the label.
    async function tick() {
      // Fetch today's times only once; if a fetch fails it's retried on the next tick.
      if (!today) today = await getSunTimes(lat as number, lng as number, 'today');
      if (!today) {
        if (!cancelled) setDisplay(null);
        return;
      }
      const now = new Date();
      // After today's evening blue hour, the next event is tomorrow's dawn.
      if (now.getTime() >= today.civilTwilightEnd.getTime() && !tomorrow) {
        tomorrow = await getSunTimes(lat as number, lng as number, 'tomorrow');
      }
      if (cancelled) return;
      // If tomorrow's fetch failed, fall back to today's times as an approximation.
      const event = computeNextLightEvent(now, today, tomorrow ?? today);
      setDisplay({ label: formatLightEvent(event), kind: event.kind });
    }

    // Run immediately, then once a minute (the label has minute resolution).
    tick();
    const interval = setInterval(tick, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lat, lng]);

  return display;
}
