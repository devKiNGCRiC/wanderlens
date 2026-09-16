import type { SunTimes } from '@/lib/sunTimes';

export type LightEvent = { kind: 'golden' | 'blue'; active: boolean; minutesUntil: number };

const GOLDEN_HOUR_MINUTES = 60;

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
export function computeNextLightEvent(now: Date, today: SunTimes, tomorrow: SunTimes): LightEvent {
  const goldenMorningEnd = new Date(today.sunrise.getTime() + GOLDEN_HOUR_MINUTES * 60000);
  const goldenEveningStart = new Date(today.sunset.getTime() - GOLDEN_HOUR_MINUTES * 60000);
  const t = now.getTime();

  if (t < today.civilTwilightBegin.getTime()) {
    return { kind: 'blue', active: false, minutesUntil: minutesBetween(now, today.civilTwilightBegin) };
  }
  if (t < today.sunrise.getTime()) {
    return { kind: 'blue', active: true, minutesUntil: minutesBetween(now, today.sunrise) };
  }
  if (t < goldenMorningEnd.getTime()) {
    return { kind: 'golden', active: true, minutesUntil: minutesBetween(now, goldenMorningEnd) };
  }
  if (t < goldenEveningStart.getTime()) {
    return { kind: 'golden', active: false, minutesUntil: minutesBetween(now, goldenEveningStart) };
  }
  if (t < today.sunset.getTime()) {
    return { kind: 'golden', active: true, minutesUntil: minutesBetween(now, today.sunset) };
  }
  if (t < today.civilTwilightEnd.getTime()) {
    return { kind: 'blue', active: true, minutesUntil: minutesBetween(now, today.civilTwilightEnd) };
  }
  // Past today's blue hour — next event is tomorrow's dawn.
  return { kind: 'blue', active: false, minutesUntil: minutesBetween(now, tomorrow.civilTwilightBegin) };
}

export function formatLightEvent(e: LightEvent): string {
  const label = e.kind === 'golden' ? 'GOLDEN HOUR' : 'BLUE HOUR';
  if (e.active) {
    return e.minutesUntil <= 1 ? `${label} · ENDING NOW` : `${label} · ${e.minutesUntil}M LEFT`;
  }
  if (e.minutesUntil < 60) return `${label} · ${e.minutesUntil}M`;
  const hours = Math.floor(e.minutesUntil / 60);
  const minutes = e.minutesUntil % 60;
  return `${label} · ${hours}H${minutes > 0 ? ` ${minutes}M` : ''}`;
}
