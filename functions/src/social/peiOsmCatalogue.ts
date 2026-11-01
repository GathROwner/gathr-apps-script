import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Source age signals overdue maintenance, not loss of valid place coverage.
// Candidate/arrival/grant expiry remain separate authorization clocks.
export const PEI_CATALOGUE_REFRESH_AFTER_MS = 7 * 24 * 60 * 60_000;
export const CATALOGUE_SEARCH_RADIUS_METRES = 175;
interface Point {latitude: number; longitude: number}
interface Ring {hole: boolean; points: {lat: number; lon: number}[]}
export interface PeiCatalogue {
  manifest: {schemaVersion: number; importerVersion: number; sourceTimestamp: string;
    pbfSha256: string; elementCount: number; missingReferences: number; categories: string[];
    extent: Ring[]; [key: string]: unknown};
  limitations: {type: string; id: number; bounds: number[]; reason: string}[];
  elements: unknown[];
}
export interface CatalogueLookup {
  status: 'complete' | 'outside_coverage' | 'unavailable';
  reason?: string;
  version?: string;
  sourceTimestamp?: string;
  elements?: unknown[];
}
let cached: PeiCatalogue | undefined;

/** In the PEI latitude range this conservative projection has a5m margin. */
function ringRelation(point: Point, ring: Ring): {inside: boolean; distance: number} {
  const sx = 111_320 * Math.cos(point.latitude * Math.PI / 180), sy = 110_000;
  let inside = false, distance = Infinity;
  for (let i = 1; i < ring.points.length; i++) {
    const a = ring.points[i - 1], b = ring.points[i];
    if ((a.lat > point.latitude) !== (b.lat > point.latitude)
      && point.longitude < (b.lon - a.lon) * (point.latitude - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
    const ax = (a.lon - point.longitude) * sx, ay = (a.lat - point.latitude) * sy;
    const bx = (b.lon - point.longitude) * sx, by = (b.lat - point.latitude) * sy;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return {inside, distance};
}

export function evaluatePeiCatalogue(data: PeiCatalogue, point: Point, nowMs: number): CatalogueLookup {
  const manifest = data?.manifest;
  const validRing = (ring: Ring) => typeof ring?.hole === 'boolean' && Array.isArray(ring.points)
    && ring.points.length >= 4 && ring.points.every(p => Number.isFinite(p.lat) && Math.abs(p.lat) <= 85
      && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180)
    && ring.points[0].lat === ring.points.at(-1)?.lat && ring.points[0].lon === ring.points.at(-1)?.lon;
  if (manifest?.schemaVersion !== 1 || manifest.importerVersion !== 1 || manifest.missingReferences !== 0
    || !Array.isArray(data.elements) || data.elements.length !== manifest.elementCount
    || !Array.isArray(manifest.extent) || !manifest.extent.length || !manifest.extent.every(validRing)
    || !manifest.extent.some(ring => !ring.hole)
    || !/^[a-f0-9]{64}$/.test(manifest.pbfSha256)
    || JSON.stringify(manifest.categories) !== JSON.stringify(['amenity', 'shop', 'tourism', 'leisure'])
    || !Array.isArray(data.limitations)) return {status: 'unavailable', reason: 'invalid_catalogue'};
  const relations = manifest.extent.map(ring => ({ring, ...ringRelation(point, ring)}));
  const radius = CATALOGUE_SEARCH_RADIUS_METRES + 5;
  if (!relations.some(r => !r.ring.hole && r.inside && r.distance > radius)
    || relations.some(r => r.ring.hole && (r.inside || r.distance <= radius))) return {status: 'outside_coverage'};
  const version = `pei-${manifest.sourceTimestamp}-${manifest.pbfSha256.slice(0, 12)}`;
  const details = {version, sourceTimestamp: manifest.sourceTimestamp};
  const sourceMs = Date.parse(manifest.sourceTimestamp);
  if (!Number.isFinite(sourceMs) || sourceMs > nowMs)
    return {status: 'unavailable', reason: 'catalogue_age', ...details};
  const latDelta = radius / 110_000, lonDelta = radius / (110_000 * Math.cos(point.latitude * Math.PI / 180));
  for (const limitation of data.limitations) {
    const b = limitation.bounds;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)
      || b[0] > b[2] || b[1] > b[3]) return {status: 'unavailable', reason: 'invalid_geometry_coverage', ...details};
    if (b[0] <= point.latitude + latDelta && b[2] >= point.latitude - latDelta
      && b[1] <= point.longitude + lonDelta && b[3] >= point.longitude - lonDelta)
      return {status: 'unavailable', reason: 'incomplete_geometry', ...details};
  }
  // A complete bounded regional scan preserves large footprints whose center
  // is outside the search circle. No arbitrary catalogue record truncation.
  return {status: 'complete', elements: data.elements, ...details,
    ...(nowMs - sourceMs > PEI_CATALOGUE_REFRESH_AFTER_MS ? {reason: 'catalogue_refresh_overdue'} : {})};
}

export function lookupPeiOsmCatalogue(point: Point, nowMs: number): CatalogueLookup {
  try {
    if (!cached) {
      const bytes = readFileSync(join(__dirname, 'data', 'pei-osm-catalogue.json'));
      const expected = readFileSync(join(__dirname, 'data', 'pei-osm-catalogue.sha256'), 'utf8').trim();
      if (!/^[a-f0-9]{64}$/.test(expected) || createHash('sha256').update(bytes).digest('hex') !== expected)
        return {status: 'unavailable', reason: 'catalogue_integrity'};
      cached = JSON.parse(bytes.toString('utf8')) as PeiCatalogue;
    }
    return evaluatePeiCatalogue(cached, point, nowMs);
  } catch {
    return {status: 'unavailable', reason: 'catalogue_unavailable'};
  }
}
