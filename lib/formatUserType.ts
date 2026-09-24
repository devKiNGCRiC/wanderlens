/**
 * lib/formatUserType.ts: display label for a profile's `user_type`.
 *
 * Used on profiles, the Connect tab, and the Feed. Pure function.
 */

/**
 * @param type The raw `profiles.user_type` value chosen in onboarding.
 * @returns A human label, or null for an unknown/empty value so the caller can hide it.
 */
export function formatUserType(type: string | null | undefined): string | null {
  if (type === 'both') return 'Traveler & Photographer';
  if (type === 'traveler') return 'Traveler';
  if (type === 'photographer') return 'Photographer';
  return null;
}