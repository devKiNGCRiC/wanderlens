/**
 * store/spotCamera.ts: hands a geo-tagged photo from the in-app camera to Add Spot.
 *
 * Flow: app/spot-camera.tsx takes the photo and gathers its metadata
 * (location, altitude, place name, weather), stores it here with
 * `setCaptured`, then goes back (or replaces itself with /add-spot when it
 * was opened on its own); app/add-spot.tsx reads `captured` to
 * pre-fill the new spot. Same Zustand handoff pattern as store/locationPicker.ts.
 */
import { create } from 'zustand';

/**
 * One camera capture and its metadata. Location and weather fields are null
 * when they couldn't be obtained (e.g. no GPS fix or lookup failed).
 */
export type CapturedPhoto = {
  // Local file URI of the photo.
  uri: string;
  // Same photo as base64, ready for upload.
  base64: string;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  // Timestamp string of when the photo was taken.
  capturedAt: string;
  // From lib/geocoding.ts reverseGeocode.
  placeName: string | null;
  address: string | null;
  // From lib/weather.ts getCurrentWeather.
  weatherTempC: number | null;
  weatherCondition: string | null;
};

/** Store shape: the pending capture (or null) and its setter. */
type SpotCameraState = {
  captured: CapturedPhoto | null;
  setCaptured: (photo: CapturedPhoto | null) => void;
};

/** Hook, e.g. `useSpotCameraStore((s) => s.captured)`. Starts empty. */
export const useSpotCameraStore = create<SpotCameraState>((set) => ({
  captured: null,
  setCaptured: (photo) => set({ captured: photo }),
}));
