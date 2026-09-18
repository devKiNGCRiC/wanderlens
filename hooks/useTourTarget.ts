import { useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { useTour } from '@/context/TourProvider';

// Attach the returned ref to the element a tour step should highlight.
export function useTourTarget(id: string) {
  const ref = useRef<View>(null);
  const { registerTarget } = useTour();
  useEffect(() => registerTarget(id, ref), [id, registerTarget]);
  return ref;
}
