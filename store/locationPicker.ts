import { create } from 'zustand';

type PickedLocation = { lat: number; lng: number; label: string } | null;

type LocationPickerState = {
  picked: PickedLocation;
  setPicked: (loc: PickedLocation) => void;
};

export const useLocationPickerStore = create<LocationPickerState>((set) => ({
  picked: null,
  setPicked: (loc) => set({ picked: loc }),
}));