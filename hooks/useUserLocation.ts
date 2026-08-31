import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

export function useUserLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const refresh = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return null;
    }
    setPermissionDenied(false);

    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      setCoords({ lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude });
    }

    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const result = { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
    setCoords(result);
    return result;
  }, []);

  return { coords, permissionDenied, refresh };
}