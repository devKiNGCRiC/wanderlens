/**
 * lib/validation.ts: "what's still missing" for forms.
 *
 * Used by Add Spot, onboarding and signup so a failed Save names only the
 * fields that are actually missing ("Still needed: a title and a genre.")
 * instead of listing every required field. Pure functions, no React.
 */

/** One required field: whether it's filled, and how to name it in a sentence ("a title"). */
export type Requirement = { ok: boolean; name: string };

/** Names of the requirements that aren't met, in form order. */
export function missingNames(requirements: Requirement[]): string[] {
  return requirements.filter((r) => !r.ok).map((r) => r.name);
}

/** "a", "a and b", "a, b and c". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Still needed: a title and a genre." — or '' when nothing is missing. */
export function stillNeeded(requirements: Requirement[]): string {
  const names = missingNames(requirements);
  return names.length === 0 ? '' : `Still needed: ${joinNames(names)}.`;
}
