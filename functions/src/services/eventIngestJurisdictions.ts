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

export interface EventLocationCheckInput {
  province?: unknown;
  address?: unknown;
  locationLabels?: unknown[];
  description?: unknown;
}

export interface EventLocationCheckResult {
  decision: 'allow' | 'reject' | 'hold' | 'unknown';
  reason: string;
  provinceCodes: string[];
  evidence: string[];
}

const PROVINCES: Readonly<Record<string, string>> = {
  pe: 'PE', pei: 'PE', 'prince edward island': 'PE',
  on: 'ON', ontario: 'ON', ns: 'NS', 'nova scotia': 'NS',
  nb: 'NB', 'new brunswick': 'NB', nl: 'NL', 'newfoundland and labrador': 'NL',
  qc: 'QC', quebec: 'QC', mb: 'MB', manitoba: 'MB', sk: 'SK', saskatchewan: 'SK',
  ab: 'AB', alberta: 'AB', bc: 'BC', 'british columbia': 'BC',
  yt: 'YT', yukon: 'YT', nt: 'NT', 'northwest territories': 'NT', nu: 'NU', nunavut: 'NU',
};
const PROVINCE_PATTERN = Object.keys(PROVINCES).sort((a, b) => b.length - a.length).join('|');
const originContext = /\b(?:born|raised|grew up|hometown|originally|based|hails|travell?ing|visiting|artist from|performer from)\b/i;
const supportingLocationContext = /\b(?:tickets?|box office|organizer|organised by|organized by|presented by|headquarters|sponsor|film follows|story follows|story is set|film is set|movie is set)\b/i;
const eventLocationContext = /\b(?:showcase|concert|performance|event|festival|session|class|workshop|meeting|screening|race|tournament|takes? place|taking place|held|happening|join us|visit us|located|venue)\b/i;

/** Event-local evidence only. Never pass an entire gallery or publisher biography. */
export function checkEventLocationAgainstAllowedRegions(
  input: EventLocationCheckInput,
  rawAllowedRegionCodes = process.env.EVENT_INGEST_ALLOWED_REGIONS
): EventLocationCheckResult {
  const evidence: string[] = [];
  const provinces = new Set<string>();
  const add = (province: string, text: string): void => {
    const code = PROVINCES[province.toLowerCase().trim()];
    if (code) { provinces.add(code); evidence.push(text); }
  };
  add(String(input.province || ''), `province:${String(input.province || '')}`);
  const suffix = new RegExp(`,\\s*(${PROVINCE_PATTERN})(?=\\b)(?:\\s+[A-Z]\\d[A-Z]\\s*\\d[A-Z]\\d)?(?:,?\\s*Canada)?\\s*$`, 'i');
  for (const value of [input.address, ...(input.locationLabels || [])]) {
    const text = String(value || '').trim();
    const match = text.match(suffix);
    if (match) add(match[1], text);
  }
  // The explicit "in City, Province" event statement covers image-derived
  // room schedules without letting a bare province mention or artist origin
  // decide coverage. Conflicting event statements hold the occurrence.
  const description = String(input.description || '');
  const location = new RegExp(`\\b(?:in|à)\\s+[\\p{L}][\\p{L}'’ -]{1,50},\\s*(${PROVINCE_PATTERN})\\b`, 'giu');
  for (const match of description.matchAll(location)) {
    const prefix = description.slice(Math.max(0, (match.index || 0) - 90), match.index)
      .split(/[.!?;\n]/).pop() || '';
    if (eventLocationContext.test(prefix) && !originContext.test(prefix) && !supportingLocationContext.test(prefix)) {
      add(match[1], match[0]);
    }
  }
  const provinceCodes = [...provinces];
  const result = (decision: EventLocationCheckResult['decision'], reason: string): EventLocationCheckResult =>
    ({ decision, reason, provinceCodes, evidence });
  if (!provinceCodes.length) return result('unknown', 'no_explicit_event_region');
  if (provinceCodes.length > 1) return result('hold', 'conflicting_event_regions');
  const { allowedRegionCodes } = parseAllowedEventIngestRegionCodes(rawAllowedRegionCodes);
  if (!allowedRegionCodes.length) return result('unknown', 'no_valid_configured_regions');
  const region = provinceCodes[0] === 'PE' ? 'PEI' : provinceCodes[0];
  return allowedRegionCodes.includes(region)
    ? result('allow', 'explicit_event_region_allowed')
    : result('reject', 'explicit_event_region_outside_coverage');
}
