/**
 * lib/tripStatus.ts: a profile's trip as "Going to / Currently in / Was in".
 *
 * A profile has one trip (trip_destinations + trip_start_date +
 * trip_end_date, set in Edit Profile and used for Connect's trip matching).
 * Its status comes purely from today's date, so nothing needs updating when
 * a trip starts or ends. Pure functions, no React; see __tests__/tripStatus-test.ts.
 */
import { fromDateOnly } from '@/lib/dateOnly';

export type TripKind = 'upcoming' | 'now' | 'past';
export type TripStatus = { kind: TripKind; text: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Destinations are stored trimmed and lower case; show them as "Tawang, Sela Pass". */
function placeList(destinations: string[]): string {
  // Split on spaces rather than regex \b, which only knows ASCII letters and
  // would capitalise "ñuble" as "ñUble".
  return destinations
    .map((d) => d.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    .filter(Boolean)
    .join(', ');
}

/** "11–14 Oct", "28 Oct – 3 Nov", or "28 Dec 2026 – 3 Jan 2027" across years. */
export function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return start.getDate() === end.getDate()
      ? `${start.getDate()} ${MONTHS[start.getMonth()]}`
      : `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  if (sameYear) return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  return `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

/**
 * The trip's status on `today`, or null when there's no complete trip
 * (destinations + both dates), the same rule Connect's matching uses.
 * The trip is "now" from its start day through its end day, inclusive.
 */
export function tripStatus(
  destinations: string[] | null,
  startDate: string | null,
  endDate: string | null,
  today: Date = new Date(),
): TripStatus | null {
  if (!destinations || destinations.length === 0 || !startDate || !endDate) return null;
  const places = placeList(destinations);
  if (!places) return null;
  const start = fromDateOnly(startDate);
  const end = fromDateOnly(endDate);
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const range = formatDateRange(start, end);

  if (day < start) return { kind: 'upcoming', text: `Going to ${places} · ${range}` };
  if (day <= end) {
    const last = end.getDate() === start.getDate() && end.getMonth() === start.getMonth() ? 'today' : `until ${end.getDate()} ${MONTHS[end.getMonth()]}`;
    return { kind: 'now', text: `Currently in ${places} · ${last}` };
  }
  return { kind: 'past', text: `Was in ${places} · ${range}` };
}
