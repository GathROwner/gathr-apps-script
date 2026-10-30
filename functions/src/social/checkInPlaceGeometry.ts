// Shared by discovery and both eligibility protocols. Boundaries are public OSM
// geometry kept only in the short-lived, server-owned candidate document.
export const CHECK_IN_BASE_RADIUS_METRES = 50;
export const CHECK_IN_PUBLIC_MAX_ACCURACY_METRES = 25;
export interface PlacePoint { latitude: number; longitude: number }
export interface BoundaryPoint { lat: number; lon: number }

export function pointDistance(a: PlacePoint, b: PlacePoint): number {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude))
    * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Only complete, bounded closed ways are supported; never use a bounding box
 * or partial/multipolygon geometry as a substitute for a venue footprint. */
export function parseCheckInBoundary(value: unknown): BoundaryPoint[] | undefined {
  if (!Array.isArray(value) || value.length < 4 || value.length > 256) return undefined;
  const ring: BoundaryPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || typeof raw.lat !== 'number' || typeof raw.lon !== 'number'
      || !Number.isFinite(raw.lat) || Math.abs(raw.lat) > 85
      || !Number.isFinite(raw.lon) || Math.abs(raw.lon) > 180) return undefined;
    ring.push({ lat: raw.lat, lon: raw.lon });
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) return undefined;
  if (ring.some(p => Math.abs(p.lon - first.lon) > 0.1
    || pointDistance({ latitude: first.lat, longitude: first.lon }, { latitude: p.lat, longitude: p.lon }) > 5_000)) return undefined;
  const area = ring.slice(1).reduce((sum, p, i) => sum
    + (ring[i].lon - first.lon) * (p.lat - first.lat)
    - (p.lon - first.lon) * (ring[i].lat - first.lat), 0);
  if (Math.abs(area) < 1e-12) return undefined;
  return ring;
}

export function checkInPlaceDistance(origin: PlacePoint, pin: PlacePoint, boundary?: BoundaryPoint[]): number {
  if (!boundary) return pointDistance(origin, pin);
  // Local metre projection is sufficient for the validated <=5 km footprint.
  const xScale = 6_371_000 * Math.PI / 180 * Math.cos(origin.latitude * Math.PI / 180);
  const yScale = 6_371_000 * Math.PI / 180;
  let inside = false;
  let nearest = Infinity;
  for (let i = 1; i < boundary.length; i++) {
    const a = boundary[i - 1], b = boundary[i];
    const ax = (a.lon - origin.longitude) * xScale, ay = (a.lat - origin.latitude) * yScale;
    const bx = (b.lon - origin.longitude) * xScale, by = (b.lat - origin.latitude) * yScale;
    if ((ay > 0) !== (by > 0) && 0 < ax + (bx - ax) * -ay / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : nearest;
}

export function publicCheckInRadius(accuracy: number): number {
  return CHECK_IN_BASE_RADIUS_METRES + Math.min(Math.max(0, accuracy), CHECK_IN_PUBLIC_MAX_ACCURACY_METRES);
}
