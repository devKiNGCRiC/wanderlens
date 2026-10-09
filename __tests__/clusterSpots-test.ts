// Map pin grouping: spots a few metres apart become one pin.
import { describe, it, expect } from '@jest/globals';
import { clusterSpots, haversineMeters } from '@/lib/clusterSpots';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(27.5, 92.1, 27.5, 92.1)).toBe(0);
  });
  it('gives about 111 km per degree of latitude', () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
  it('is symmetric', () => {
    expect(haversineMeters(12.97, 77.59, 28.61, 77.2)).toBeCloseTo(haversineMeters(28.61, 77.2, 12.97, 77.59), 6);
  });
});

describe('clusterSpots', () => {
  // ~0.0001° latitude is ~11 m, so these offsets are easy to reason about.
  const spot = (id: string, dLat: number) => ({ id, lat: 27.5 + dLat, lng: 92.1 });

  it('returns nothing for no spots', () => {
    expect(clusterSpots([])).toEqual([]);
  });
  it('keeps far-apart spots as single-spot clusters', () => {
    const result = clusterSpots([spot('a', 0), spot('b', 0.01)]);
    expect(result.map((c) => c.map((s) => s.id))).toEqual([['a'], ['b']]);
  });
  it('groups spots within the 40 m default threshold', () => {
    const result = clusterSpots([spot('a', 0), spot('b', 0.0002), spot('c', 0.01)]);
    expect(result.map((c) => c.map((s) => s.id))).toEqual([['a', 'b'], ['c']]);
  });
  it('measures distance to the seed spot only (no chaining)', () => {
    // b is ~33 m from a, c is ~33 m from b but ~66 m from a: c stays separate.
    const result = clusterSpots([spot('a', 0), spot('b', 0.0003), spot('c', 0.0006)]);
    expect(result.map((c) => c.map((s) => s.id))).toEqual([['a', 'b'], ['c']]);
  });
  it('puts every spot in exactly one cluster', () => {
    const spots = Array.from({ length: 20 }, (_, i) => spot(String(i), (i % 4) * 0.0001));
    const ids = clusterSpots(spots).flat().map((s) => s.id).sort();
    expect(ids).toEqual(spots.map((s) => s.id).sort());
  });
  it('honours a custom threshold', () => {
    expect(clusterSpots([spot('a', 0), spot('b', 0.0002)], 10)).toHaveLength(2);
  });
});
