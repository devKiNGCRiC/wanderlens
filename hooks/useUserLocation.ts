/**
 * useUserLocation: asks for location permission and returns the device's coordinates.
 *
 * Used by the Feed and Map tabs, the chat screen (sharing a location), and the
 * trail generator. Uses expo-location with foreground ("when in use")
 * permission only; see .claude/rules/security.md before broadening it.
 *
 * How it works: nothing happens until the caller runs `refresh()` (typically
 * from useFocusEffect). It returns a cached last-known fix immediately when
 * one exists and refines it in the background; otherwise it waits for a fresh
 * GPS fix.
 */
import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

/**
 * @returns `coords` (null until known), `permissionDenied` (for showing a
 * prompt/empty state), and `refresh()`, which resolves to the coordinates
 * or null if permission was refused.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Stable identity (empty deps) so callers can list it in useFocusEffect/useCallback deps.
  const refresh = useCallback(async () => {
    // Shows the OS permission dialog the first time; later calls return the saved answer.
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return null;
    }
    setPermissionDenied(false);

    // Fast path: the OS's cached last fix returns almost instantly, so the
    // screen can start its location-based queries without waiting on GPS.
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      const result = { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
      setCoords(result);
      // Refine accuracy quietly in the background — doesn't block the caller
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((fresh) => setCoords({ lat: fresh.coords.latitude, lng: fresh.coords.longitude }))
        .catch(() => {});
      return result;
    }

    // Slow path: no cached fix, so wait for a live one. Errors here propagate to the caller.
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const result = { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
    setCoords(result);
    return result;
  }, []);

  return { coords, permissionDenied, refresh };
}