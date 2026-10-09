// The Feed hero's golden/blue-hour countdown.
import { describe, it, expect } from '@jest/globals';
import { computeNextLightEvent, formatLightEvent } from '@/lib/goldenHour';
import type { SunTimes } from '@/lib/sunTimes';

// A simple day: twilight 05:30, sunrise 06:00, sunset 18:00, twilight ends 18:30.
const at = (h: number, m = 0, day = 9) => new Date(2026, 9, day, h, m);
const day = (d: number): SunTimes => ({
  civilTwilightBegin: at(5, 30, d),
  sunrise: at(6, 0, d),
  sunset: at(18, 0, d),
  civilTwilightEnd: at(18, 30, d),
});
const today = day(9);
const tomorrow = day(10);
const event = (h: number, m = 0) => computeNextLightEvent(at(h, m), today, tomorrow);

describe('computeNextLightEvent', () => {
  it('before dawn: blue hour is next', () => {
    expect(event(5, 0)).toEqual({ kind: 'blue', active: false, minutesUntil: 30 });
  });
  it('dawn twilight: blue hour is on until sunrise', () => {
    expect(event(5, 45)).toEqual({ kind: 'blue', active: true, minutesUntil: 15 });
  });
  it('first hour after sunrise: golden hour is on', () => {
    expect(event(6, 20)).toEqual({ kind: 'golden', active: true, minutesUntil: 40 });
  });
  it('midday: counts down to the evening golden hour (an hour before sunset)', () => {
    expect(event(12, 0)).toEqual({ kind: 'golden', active: false, minutesUntil: 300 });
  });
  it('last hour before sunset: golden hour is on', () => {
    expect(event(17, 30)).toEqual({ kind: 'golden', active: true, minutesUntil: 30 });
  });
  it('after sunset: blue hour is on until twilight ends', () => {
    expect(event(18, 10)).toEqual({ kind: 'blue', active: true, minutesUntil: 20 });
  });
  it('night: counts down to tomorrow\'s dawn twilight', () => {
    expect(event(22, 0)).toEqual({ kind: 'blue', active: false, minutesUntil: 450 });
  });
});

describe('formatLightEvent', () => {
  it('active windows show time left, or "ending now" in the last minute', () => {
    expect(formatLightEvent({ kind: 'golden', active: true, minutesUntil: 12 })).toBe('GOLDEN HOUR · 12M LEFT');
    expect(formatLightEvent({ kind: 'blue', active: true, minutesUntil: 1 })).toBe('BLUE HOUR · ENDING NOW');
  });
  it('upcoming windows show minutes, then hours and minutes', () => {
    expect(formatLightEvent({ kind: 'golden', active: false, minutesUntil: 42 })).toBe('GOLDEN HOUR · 42M');
    expect(formatLightEvent({ kind: 'golden', active: false, minutesUntil: 125 })).toBe('GOLDEN HOUR · 2H 5M');
    expect(formatLightEvent({ kind: 'blue', active: false, minutesUntil: 120 })).toBe('BLUE HOUR · 2H');
  });
});
