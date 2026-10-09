// Pure display helpers: relative time, user type, dates, coordinates, place labels.
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import { formatUserType } from '@/lib/formatUserType';
import { toDateOnly, fromDateOnly } from '@/lib/dateOnly';
import { formatDecimalCoords, formatPlaceLine, composeLocationLabel, formatDMS } from '@/lib/geocoding';

describe('formatTimeAgo', () => {
  const NOW = new Date('2026-10-09T12:00:00Z').getTime();
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
  afterAll(() => { jest.useRealTimers(); });
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  it('says "just now" under a minute', () => {
    expect(formatTimeAgo(ago(30_000))).toBe('just now');
  });
  it('uses minutes, hours and days at each boundary', () => {
    expect(formatTimeAgo(ago(MIN))).toBe('1m ago');
    expect(formatTimeAgo(ago(59 * MIN))).toBe('59m ago');
    expect(formatTimeAgo(ago(HOUR))).toBe('1h ago');
    expect(formatTimeAgo(ago(23 * HOUR))).toBe('23h ago');
    expect(formatTimeAgo(ago(DAY))).toBe('1d ago');
    expect(formatTimeAgo(ago(6 * DAY))).toBe('6d ago');
  });
  it('moves on to weeks, months and years', () => {
    expect(formatTimeAgo(ago(7 * DAY))).toBe('1w ago');
    expect(formatTimeAgo(ago(34 * DAY))).toBe('4w ago');
    expect(formatTimeAgo(ago(60 * DAY))).toBe('2mo ago');
    expect(formatTimeAgo(ago(400 * DAY))).toBe('1y ago');
  });
  it('treats a timestamp in the future as "just now"', () => {
    expect(formatTimeAgo(new Date(NOW + 5 * MIN).toISOString())).toBe('just now');
  });
});

describe('formatUserType', () => {
  it('maps the three stored values', () => {
    expect(formatUserType('traveler')).toBe('Traveler');
    expect(formatUserType('photographer')).toBe('Photographer');
    expect(formatUserType('both')).toBe('Traveler & Photographer');
  });
  it('returns null for anything else', () => {
    expect(formatUserType(null)).toBeNull();
    expect(formatUserType(undefined)).toBeNull();
    expect(formatUserType('admin')).toBeNull();
  });
});

describe('dateOnly', () => {
  it('formats a local date with zero padding', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('round-trips without shifting the day (no UTC drift)', () => {
    const d = fromDateOnly('2026-12-31');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 31]);
    expect(toDateOnly(fromDateOnly('2026-03-01'))).toBe('2026-03-01');
  });
});

describe('formatDecimalCoords', () => {
  it('shows 5 decimals with hemisphere letters', () => {
    expect(formatDecimalCoords(27.504213, 92.103721)).toBe('27.50421° N, 92.10372° E');
  });
  it('uses S and W for negative values, without a minus sign', () => {
    expect(formatDecimalCoords(-33.8688, -70.6693)).toBe('33.86880° S, 70.66930° W');
  });
});

describe('formatDMS', () => {
  it('converts decimal degrees to degrees/minutes/seconds', () => {
    expect(formatDMS(13.05, 'lat')).toBe('13°3\'0.0"N');
    expect(formatDMS(-80.2625, 'lng')).toBe('80°15\'45.0"W');
  });
});

describe('formatPlaceLine', () => {
  it('joins the parts that exist and labels the PIN', () => {
    expect(formatPlaceLine({ locality: 'Tawang', state: 'Arunachal Pradesh', country: 'India', postcode: '790104' }))
      .toBe('Tawang · Arunachal Pradesh · India · PIN 790104');
  });
  it('skips missing parts and returns empty when there are none', () => {
    expect(formatPlaceLine({ locality: null, state: 'Sikkim', country: 'India', postcode: null })).toBe('Sikkim · India');
    expect(formatPlaceLine({ locality: null, state: null, country: null, postcode: null })).toBe('');
  });
});

describe('composeLocationLabel', () => {
  it('puts the user\'s name first, then the address', () => {
    expect(composeLocationLabel('Sela Pass', { locality: 'Tawang', state: 'Arunachal Pradesh', country: 'India' }))
      .toBe('Sela Pass, Tawang, Arunachal Pradesh, India');
  });
  it('does not repeat a part already used as the name, ignoring case', () => {
    expect(composeLocationLabel('tawang', { locality: 'Tawang', state: 'Arunachal Pradesh', country: 'India' }))
      .toBe('tawang, Arunachal Pradesh, India');
  });
  it('drops blank parts', () => {
    expect(composeLocationLabel('Pangong Lake', { locality: '  ', state: 'Ladakh', country: null }))
      .toBe('Pangong Lake, Ladakh');
  });
});
