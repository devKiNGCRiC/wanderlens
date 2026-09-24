/**
 * lib/formatTimeAgo.ts: turns a timestamp into a short relative label.
 *
 * Used for post, comment, notification, trail, and chat timestamps across the
 * app. Pure function, no React.
 */

/**
 * @param dateString An ISO timestamp, e.g. a Supabase `created_at` value.
 * @returns "just now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", or "1y ago".
 * Months and years are approximated as 30 and 365 days.
 */
export function formatTimeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  // Each step converts to the next larger unit and returns at the first one that fits.
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}