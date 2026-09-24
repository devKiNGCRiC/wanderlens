/**
 * lib/clusterSpots.ts: groups map spots that sit very close together.
 *
 * Used by app/(tabs)/map.tsx so spots within a few metres of each other are
 * drawn as one grouped pin instead of overlapping markers. Pure function, no
 * React or network.
 */

/** Minimal shape needed for clustering; any spot row with these fields works. */
type SpotLike = { id: string; lat: number; lng: number };

/**
 * Great-circle distance between two lat/lng points using the haversine
 * formula, which treats the Earth as a sphere.
 * @returns Distance in metres.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  // Mean Earth radius in metres.
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  // `a` is the squared half-chord length between the points; atan2 turns it into the central angle.
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Greedy single-pass clustering: each not-yet-used spot starts a cluster and
 * pulls in every other unused spot within `thresholdMeters` of it (distance is
 * measured to the seed spot only). O(n^2), fine for the number of spots on
 * screen.
 * @param spots Spots to group, in the order given.
 * @param thresholdMeters Max distance from the seed spot to join its cluster (default 40 m).
 * @returns Array of clusters; single spots come back as one-element clusters.
 */
export function clusterSpots<T extends SpotLike>(spots: T[], thresholdMeters = 40): T[][] {
  const clusters: T[][] = [];
  // Ids already placed in a cluster, so no spot appears twice.
  const used = new Set<string>();
  for (const spot of spots) {
    if (used.has(spot.id)) continue;
    // This spot seeds a new cluster.
    const cluster = [spot];
    used.add(spot.id);
    // Pull in every remaining spot close enough to the seed.
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