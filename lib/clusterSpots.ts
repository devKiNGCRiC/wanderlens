type SpotLike = { id: string; lat: number; lng: number };

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function clusterSpots<T extends SpotLike>(spots: T[], thresholdMeters = 40): T[][] {
  const clusters: T[][] = [];
  const used = new Set<string>();
  for (const spot of spots) {
    if (used.has(spot.id)) continue;
    const cluster = [spot];
    used.add(spot.id);
    for (const other of spots) {
      if (used.has(other.id)) continue;
      if (haversineMeters(spot.lat, spot.lng, other.lat, other.lng) < thresholdMeters) {
        cluster.push(other);
        used.add(other.id);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}