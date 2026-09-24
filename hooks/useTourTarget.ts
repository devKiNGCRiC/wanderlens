/**
 * useTourTarget: marks a view as something the first-run tour can highlight.
 *
 * Used by app/(tabs)/index.tsx and app/(tabs)/map.tsx for their floating
 * buttons. The id must match a step's `target.id` in constants/tourSteps.ts.
 * Registration goes to context/TourProvider.tsx, which measures the view
 * when that step is shown. Must be called inside the tabs (under TourProvider).
 */
import { useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { useTour } from '@/context/TourProvider';

// Attach the returned ref to the element a tour step should highlight.
/**
 * @param id The tour target id, e.g. 'feed-camera-fab'.
 * @returns A ref to pass as `ref={...}` on the target View.
 */
export function useTourTarget(id: string) {
  const ref = useRef<View>(null);
  const { registerTarget } = useTour();
  // registerTarget returns its own unregister function, which React runs as the cleanup.
  useEffect(() => registerTarget(id, ref), [id, registerTarget]);
  return ref;
}
