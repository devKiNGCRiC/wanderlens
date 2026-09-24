/**
 * store/locationPicker.ts: hands a picked location from the map picker back to Add Spot.
 *
 * Flow: app/add-spot.tsx opens app/pick-location.tsx; the user drops a pin or
 * searches; pick-location writes the result here with `setPicked` and goes
 * back; add-spot subscribes to `picked` and sees the new value.
 *
 * Why Zustand: expo-router can't return a value from a screen the way a modal
 * callback would, so a tiny global store carries it across. This is the
 * model for "modal returns a value" handoffs (see .claude/rules/architecture.md).
 * Zustand's `create` returns a hook; components that read from it re-render
 * when the value changes.
 */
import { create } from 'zustand';

/** The chosen coordinate plus a readable label, or null when nothing is picked. */
type PickedLocation = { lat: number; lng: number; label: string } | null;

/** Store shape: the current value and its setter. */
type LocationPickerState = {
  picked: PickedLocation;
  setPicked: (loc: PickedLocation) => void;
};

/** Hook, e.g. `useLocationPickerStore((s) => s.picked)`. Starts empty. */
export const useLocationPickerStore = create<LocationPickerState>((set) => ({
  picked: null,
  setPicked: (loc) => set({ picked: loc }),
}));