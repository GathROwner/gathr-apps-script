import { logger } from '../utils/logger.js';

/**
 * Canonical PEI city/area centroid table.
 *
 * Single source of truth for the broad-location places the pipeline is willing
 * to auto-publish city-level events for. Keys are normalized place names (see
 * normalizePeiPlaceName). Centroids place the event marker at the community
 * center on the app map.
 *
 * IMPORTANT: centroid values are hand-verified against a map before deploy.
 * A missing entry is safe (the event falls back to the manual review queue);
 * a wrong coordinate puts a marker in the wrong place.
 *
 * Related-but-different tables that intentionally stay separate:
 * - PEI_CITY_HINTS (firestoreService.ts) / unknownVenueResolver.ts hints do
 *   corpus inference on free text, not centroid lookup.
 */
export interface PeiPlaceCentroid {
  /** Display label, e.g. "Kensington, PEI" or "Downtown Charlottetown". */
  label: string;
  /** City the place belongs to (for areas inside a city). */
  city?: string;
  province: 'PEI';
  scope: 'city' | 'area' | 'province';
  latitude: number;
  longitude: number;
}

const PEI_PLACE_CENTROIDS: Record<string, PeiPlaceCentroid> = {
  // Reference anchor only. Province-scope events deliberately use mapMode
  // 'none' so this coordinate never claims to be their physical venue.
  pei: {
    label: 'Across Prince Edward Island',
    province: 'PEI',
    scope: 'province',
    latitude: 46.5107,
    longitude: -63.4168,
  },
  charlottetown: {
    // Matches placesService DEFAULT_LOCATION (Charlottetown anchor).
    label: 'Charlottetown, PEI',
    city: 'Charlottetown',
    province: 'PEI',
    scope: 'city',
    latitude: 46.2382,
    longitude: -63.1311,
  },
  'downtown charlottetown': {
    label: 'Downtown Charlottetown',
    city: 'Charlottetown',
    province: 'PEI',
    scope: 'area',
    latitude: 46.2343,
    longitude: -63.1258,
  },
  summerside: {
    label: 'Summerside, PEI',
    city: 'Summerside',
    province: 'PEI',
    scope: 'city',
    latitude: 46.3959,
    longitude: -63.7876,
  },
  'downtown summerside': {
    label: 'Downtown Summerside',
    city: 'Summerside',
    province: 'PEI',
    scope: 'area',
    latitude: 46.3909,
    longitude: -63.7884,
  },
  stratford: {
    label: 'Stratford, PEI',
    city: 'Stratford',
    province: 'PEI',
    scope: 'city',
    latitude: 46.217,
    longitude: -63.0887,
  },
  cornwall: {
    label: 'Cornwall, PEI',
    city: 'Cornwall',
    province: 'PEI',
    scope: 'city',
    latitude: 46.2251,
    longitude: -63.2192,
  },
  montague: {
    label: 'Montague, PEI',
    city: 'Montague',
    province: 'PEI',
    scope: 'city',
    latitude: 46.1653,
    longitude: -62.6486,
  },
  kensington: {
    label: 'Kensington, PEI',
    city: 'Kensington',
    province: 'PEI',
    scope: 'city',
    latitude: 46.4363,
    longitude: -63.6472,
  },
  souris: {
    label: 'Souris, PEI',
    city: 'Souris',
    province: 'PEI',
    scope: 'city',
    latitude: 46.3559,
    longitude: -62.2515,
  },
  alberton: {
    label: 'Alberton, PEI',
    city: 'Alberton',
    province: 'PEI',
    scope: 'city',
    latitude: 46.8128,
    longitude: -64.0659,
  },
  georgetown: {
    label: 'Georgetown, PEI',
    city: 'Georgetown',
    province: 'PEI',
    scope: 'city',
    latitude: 46.1866,
    longitude: -62.5323,
  },
  'north rustico': {
    label: 'North Rustico, PEI',
    city: 'North Rustico',
    province: 'PEI',
    scope: 'city',
    latitude: 46.4499,
    longitude: -63.2873,
  },
  // Rustico (South Rustico area) is a distinct community a few km southwest
  // of North Rustico.
  rustico: {
    label: 'Rustico, PEI',
    city: 'Rustico',
    province: 'PEI',
    scope: 'city',
    latitude: 46.429,
    longitude: -63.301,
  },
  cavendish: {
    label: 'Cavendish, PEI',
    city: 'Cavendish',
    province: 'PEI',
    scope: 'city',
    latitude: 46.4879,
    longitude: -63.3843,
  },
};

/**
 * Known PEI city names (normalized, city scope only) for broad-location
 * classification. Consumed by sharedEventPublicPromotion so the shared-event
 * path recognizes the same set of cities this table can place on the map.
 */
export const KNOWN_PEI_CITY_NAMES: ReadonlySet<string> = new Set(
  Object.entries(PEI_PLACE_CENTROIDS)
    .filter(([, place]) => place.scope === 'city')
    .map(([key]) => key)
);

/**
 * Normalize a place name the same way the city-level classifiers do:
 * lowercase, PEI-variant collapsing, punctuation/whitespace collapsing.
 */
export function normalizePeiPlaceName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\bcanada\b/g, ' ')
    .replace(/\bprince edward island\b/g, ' pei ')
    .replace(/\bp\.?\s*e\.?\s*i\.?\b/g, ' pei ')
    .replace(/[.,;:'’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripProvinceSuffix(normalized: string): string {
  return normalized.replace(/\s+(pei|pe)$/g, '').trim();
}

/**
 * Resolve a city/area-level location to a canonical centroid, or null when the
 * place is not confidently recognized (caller should fall back to the manual
 * review queue). Area-scoped events prefer the specific label first, so
 * "Downtown Charlottetown" is not broadened to the Charlottetown city marker.
 */
export function resolvePeiCentroid(details: {
  locationScope?: 'city' | 'area' | 'province' | null;
  locationCity?: string | null;
  locationLabel?: string | null;
}): PeiPlaceCentroid | null {
  const candidates = details.locationScope === 'area'
    ? [details.locationLabel, details.locationCity]
    : [details.locationCity, details.locationLabel];
  for (const candidate of candidates) {
    const normalized = stripProvinceSuffix(normalizePeiPlaceName(candidate));
    if (!normalized) continue;
    if (normalized === 'pei' && details.locationScope !== 'province') continue;
    const match = PEI_PLACE_CENTROIDS[normalized];
    if (match) return match;
  }
  return null;
}

/**
 * Kill switch for auto-publishing city-level events at ingestion. Defaults
 * on; set CITY_LEVEL_AUTO_PUBLISH=false to divert every city-level event back
 * to the manual review queue without a code revert.
 */
export function isCityLevelAutoPublishEnabled(): boolean {
  const raw = String(process.env.CITY_LEVEL_AUTO_PUBLISH ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') {
    logger.debug('City-level auto-publish disabled via CITY_LEVEL_AUTO_PUBLISH env');
    return false;
  }
  return true;
}
