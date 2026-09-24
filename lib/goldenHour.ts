/**
 * lib/goldenHour.ts: works out the current or next "good light" window.
 *
 * Pure time math used by hooks/useGoldenHour.ts, which feeds the Feed tab's
 * golden/blue hour label. Input times come from lib/sunTimes.ts.
 *
 * Definitions used here:
 * - Blue hour: civil twilight, i.e. between civil twilight begin and sunrise
 *   (morning) or between sunset and civil twilight end (evening).
 * - Golden hour: the 60 minutes after sunrise and the 60 minutes before sunset.
 */
import type { SunTimes } from '@/lib/sunTimes';

/**
 * Which window is relevant, whether we're inside it now (`active`), and the
 * minutes until it ends (if active) or begins (if upcoming).
 */
export type LightEvent = { kind: 'golden' | 'blue'; active: boolean; minutesUntil: number };

const GOLDEN_HOUR_MINUTES = 60;

/** Whole minutes from `a` to `b`, rounded, never negative. */
function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

// Wanderlens's two named light windows for the day, derived from the three
// real boundaries sunrise-sunset.org actually returns (sunrise, sunset,
// civil twilight). Golden hour is approximated as the hour bracketing
// sunrise/sunset — the common definition most photography apps use, since
// the API doesn't return a literal "golden hour" window itself. `tomorrow`
// is only consulted once `now` is past today's blue hour, for the
// midnight-crossing case.
/**
 * Walks the day's boundaries in time order and returns the first window
 * that `now` is before or inside.
 */
export function computeNextLightEvent(now: Date, today: SunTimes, tomorrow: SunTimes): LightEvent {
  // Derived golden-hour edges: 60 min after sunrise and 60 min before sunset.
  const goldenMorningEnd = new Date(today.sunrise.getTime() + GOLDEN_HOUR_MINUTES * 60000);
  const goldenEveningStart = new Date(today.sunset.getTime() - GOLDEN_HOUR_MINUTES * 60000);
  const t = now.getTime();

  // Before dawn: morning blue hour is next.
  if (t < today.civilTwilightBegin.getTime()) {
    return { kind: 'blue', active: false, minutesUntil: minutesBetween(now, today.civilTwilightBegin) };
  }
  // Morning blue hour in progress; ends at sunrise.
  if (t < today.sunrise.getTime()) {
    return { kind: 'blue', active: true, minutesUntil: minutesBetween(now, today.sunrise) };
  }
  // Morning golden hour in progress.
  if (t < goldenMorningEnd.getTime()) {
    return { kind: 'golden', active: true, minutesUntil: minutesBetween(now, goldenMorningEnd) };
  }
  // Midday: evening golden hour is next.
  if (t < goldenEveningStart.getTime()) {
    return { kind: 'golden', active: false, minutesUntil: minutesBetween(now, goldenEveningStart) };
  }
  // Evening golden hour in progress; ends at sunset.
  if (t < today.sunset.getTime()) {
    return { kind: 'golden', active: true, minutesUntil: minutesBetween(now, today.sunset) };
  }
  // Evening blue hour in progress.
  if (t < today.civilTwilightEnd.getTime()) {
    return { kind: 'blue', active: true, minutesUntil: minutesBetween(now, today.civilTwilightEnd) };
  }
  // Past today's blue hour — next event is tomorrow's dawn.
  return { kind: 'blue', active: false, minutesUntil: minutesBetween(now, tomorrow.civilTwilightBegin) };
}

/**
 * Formats a LightEvent for display, e.g. "GOLDEN HOUR · 42M LEFT",
 * "BLUE HOUR · ENDING NOW", "GOLDEN HOUR · 2H 15M".
 */
export function formatLightEvent(e: LightEvent): string {
  const label = e.kind === 'golden' ? 'GOLDEN HOUR' : 'BLUE HOUR';
  // Active windows count down to their end.
  if (e.active) {
    return e.minutesUntil <= 1 ? `${label} · ENDING NOW` : `${label} · ${e.minutesUntil}M LEFT`;
  }
  // Upcoming windows: minutes only under an hour, otherwise hours plus any leftover minutes.
  if (e.minutesUntil < 60) return `${label} · ${e.minutesUntil}M`;
  const hours = Math.floor(e.minutesUntil / 60);
  const minutes = e.minutesUntil % 60;
  return `${label} · ${hours}H${minutes > 0 ? ` ${minutes}M` : ''}`;
}
