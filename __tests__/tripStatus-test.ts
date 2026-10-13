// A profile's trip status: going to / currently in / was in.
import { describe, it, expect } from '@jest/globals';
import { tripStatus, formatDateRange } from '@/lib/tripStatus';

const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('formatDateRange', () => {
  it('collapses a same-month range', () => {
    expect(formatDateRange(on(2026, 10, 11), on(2026, 10, 14))).toBe('11–14 Oct');
  });
  it('shows both months across a month boundary', () => {
    expect(formatDateRange(on(2026, 10, 28), on(2026, 11, 3))).toBe('28 Oct – 3 Nov');
  });
  it('adds years across a year boundary', () => {
    expect(formatDateRange(on(2026, 12, 28), on(2027, 1, 3))).toBe('28 Dec 2026 – 3 Jan 2027');
  });
  it('shows a single day once', () => {
    expect(formatDateRange(on(2026, 10, 11), on(2026, 10, 11))).toBe('11 Oct');
  });
});

describe('tripStatus', () => {
  const dest = ['tawang', 'sela pass'];

  it('is upcoming before the start day', () => {
    expect(tripStatus(dest, '2026-10-11', '2026-10-14', on(2026, 10, 10))).toEqual({
      kind: 'upcoming', text: 'Going to Tawang, Sela Pass · 11–14 Oct',
    });
  });
  it('is "now" on the first and last day, inclusive', () => {
    expect(tripStatus(dest, '2026-10-11', '2026-10-14', on(2026, 10, 11, 0))?.kind).toBe('now');
    expect(tripStatus(dest, '2026-10-11', '2026-10-14', on(2026, 10, 14, 23))).toEqual({
      kind: 'now', text: 'Currently in Tawang, Sela Pass · until 14 Oct',
    });
  });
  it('says "today" for a one-day trip', () => {
    expect(tripStatus(['ziro'], '2026-10-11', '2026-10-11', on(2026, 10, 11))?.text).toBe('Currently in Ziro · today');
  });
  it('is past after the end day', () => {
    expect(tripStatus(dest, '2026-10-11', '2026-10-14', on(2026, 10, 15))).toEqual({
      kind: 'past', text: 'Was in Tawang, Sela Pass · 11–14 Oct',
    });
  });
  it('is null without a complete trip', () => {
    expect(tripStatus(null, '2026-10-11', '2026-10-14', on(2026, 10, 10))).toBeNull();
    expect(tripStatus([], '2026-10-11', '2026-10-14', on(2026, 10, 10))).toBeNull();
    expect(tripStatus(dest, null, '2026-10-14', on(2026, 10, 10))).toBeNull();
    expect(tripStatus(dest, '2026-10-11', null, on(2026, 10, 10))).toBeNull();
    expect(tripStatus(['  '], '2026-10-11', '2026-10-14', on(2026, 10, 10))).toBeNull();
  });
  it('capitalises each word of a destination, including non-English letters', () => {
    expect(tripStatus(['bomdila monastery', 'ñuble'], '2026-11-01', '2026-11-02', on(2026, 10, 1))?.text)
      .toBe('Going to Bomdila Monastery, Ñuble · 1–2 Nov');
  });
});
