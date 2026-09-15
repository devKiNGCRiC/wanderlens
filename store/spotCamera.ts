import { create } from 'zustand';

export type CapturedPhoto = {
  uri: string;
  base64: string;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  capturedAt: string;
  weatherTempC: number | null;
  weatherCondition: string | null;
};

type SpotCameraState = {
  captured: CapturedPhoto | null;
  setCaptured: (photo: CapturedPhoto | null) => void;
};

export const useSpotCameraStore = create<SpotCameraState>((set) => ({
  captured: null,
  setCaptured: (photo) => set({ captured: photo }),
}));
