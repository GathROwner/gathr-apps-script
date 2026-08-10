export interface EventIngestRegionBounds {
  code: string;
  label: string;
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface EventCoordinateCheckInput {
  latitude?: number | string;
  longitude?: number | string;
}

export interface EventCoordinateCheckResult {
  decision: 'allow' | 'reject' | 'unknown';
  latitude?: number;
  longitude?: number;
  matchedRegionCode?: string;
  allowedRegionCodes: string[];
  unknownRegionCodes: string[];
}

/**
 * Coarse ingest boundaries used to reject unmistakably out-of-region source
 * rows before venue matching. These are intentionally conservative bounds,
 * not display coordinates and not a substitute for detailed map polygons.
 *
 * Expansion contract:
 * 1. Add a province/region boundary here.
 * 2. Enable it with EVENT_INGEST_ALLOWED_REGIONS (for example, PEI,NS).
 *
 * Keeping the registry in one module prevents PEI-only checks from spreading
 * through the parser as GathR expands to other provinces.
 */
export const EVENT_INGEST_REGION_REGISTRY: Readonly<Record<string, EventIngestRegionBounds>> = {
  PEI: {
    code: 'PEI',
    label: 'Prince Edward Island',
    minLatitude: 45.9,
    maxLatitude: 47.1,
    minLongitude: -64.6,
    maxLongitude: -61.8,
  },
};

export const DEFAULT_EVENT_INGEST_REGION_CODES = ['PEI'] as const;

function parseFiniteCoordinate(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAllowedEventIngestRegionCodes(
  raw = process.env.EVENT_INGEST_ALLOWED_REGIONS
): { allowedRegionCodes: string[]; unknownRegionCodes: string[] } {
  const requested = String(raw || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const configured = requested.length > 0
    ? Array.from(new Set(requested))
    : [...DEFAULT_EVENT_INGEST_REGION_CODES];

  return {
    allowedRegionCodes: configured.filter((code) => Boolean(EVENT_INGEST_REGION_REGISTRY[code])),
    unknownRegionCodes: configured.filter((code) => !EVENT_INGEST_REGION_REGISTRY[code]),
  };
}

function coordinateIsInsideBounds(
  latitude: number,
  longitude: number,
  bounds: EventIngestRegionBounds
): boolean {
  return latitude >= bounds.minLatitude &&
    latitude <= bounds.maxLatitude &&
    longitude >= bounds.minLongitude &&
    longitude <= bounds.maxLongitude;
}

export function checkEventCoordinatesAgainstAllowedRegions(
  input: EventCoordinateCheckInput,
  rawAllowedRegionCodes = process.env.EVENT_INGEST_ALLOWED_REGIONS
): EventCoordinateCheckResult {
  const latitude = parseFiniteCoordinate(input.latitude);
  const longitude = parseFiniteCoordinate(input.longitude);
  const { allowedRegionCodes, unknownRegionCodes } = parseAllowedEventIngestRegionCodes(
    rawAllowedRegionCodes
  );

  if (latitude === undefined || longitude === undefined) {
    return {
      decision: 'unknown',
      latitude,
      longitude,
      allowedRegionCodes,
      unknownRegionCodes,
    };
  }

  // A typo in deployment configuration must not reject every incoming row.
  // Unknown region codes are surfaced to the caller for logging, while the
  // existing venue/review safeguards remain in control.
  if (allowedRegionCodes.length === 0) {
    return {
      decision: 'unknown',
      latitude,
      longitude,
      allowedRegionCodes,
      unknownRegionCodes,
    };
  }

  const matchedRegionCode = allowedRegionCodes.find((code) =>
    coordinateIsInsideBounds(latitude, longitude, EVENT_INGEST_REGION_REGISTRY[code])
  );

  return {
    decision: matchedRegionCode ? 'allow' : 'reject',
    latitude,
    longitude,
    matchedRegionCode,
    allowedRegionCodes,
    unknownRegionCodes,
  };
}
