/**
 * lib/dateOnly.ts: convert between a JS Date and a Postgres `date` column
 * value ("YYYY-MM-DD") using the device's LOCAL calendar day.
 *
 * Why: the obvious `date.toISOString().slice(0, 10)` converts to UTC first,
 * so in a timezone ahead of UTC (e.g. IST, +5:30) a date picked early in the
 * morning is saved as the previous day. Going the other way,
 * `new Date('2026-10-01')` is parsed as UTC midnight, which shows as the
 * previous day in timezones behind UTC. Used for the trip dates in
 * app/onboarding.tsx and app/edit-profile.tsx.
 */

/** Formats a Date as "YYYY-MM-DD" using its local year, month and day. */
export function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parses "YYYY-MM-DD" as local midnight on that day (not UTC midnight). */
export function fromDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
