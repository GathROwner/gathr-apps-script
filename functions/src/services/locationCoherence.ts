import { normalizeCanadianAddress } from '../utils/addressNormalization.js';
import { checkEventCoordinatesAgainstAllowedRegions } from './eventIngestJurisdictions.js';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationRecordLike {
  address?: unknown;
  rawAddress?: unknown;
  normalizedAddress?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  coordinates?: unknown;
  googlePlaceId?: unknown;
  placeId?: unknown;
}

export interface LocationCoherenceAssessment {
  decision: 'accept' | 'reject';
  reasons: string[];
  existingCoordinates?: LocationCoordinates;
  candidateCoordinates?: LocationCoordinates;
  moveDistanceMeters?: number;
}

export interface VenueLocationCandidateInput {
  existing?: LocationRecordLike | null;
  expectedAddress?: unknown;
  candidate?: LocationRecordLike | null;
  candidateAddress?: unknown;
  allowedRegionCodes?: string;
  maximumAutomaticMoveMeters?: number;
}

export interface VenueScopedEventLocationInput {
  event?: LocationRecordLike | null;
  venue?: LocationRecordLike | null;
  allowedRegionCodes?: string;
}

export interface VenueScopedEventLocationResult {
  decision: 'accept' | 'reject';
  reasons: string[];
  coordinates?: LocationCoordinates;
  source: 'event' | 'venue' | 'none';
}

export const MAXIMUM_AUTOMATIC_VENUE_MOVE_METERS = 500;

function finiteCoordinate(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nestedCoordinateValues(value: unknown): { latitude?: unknown; longitude?: unknown } {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    latitude: record.latitude ?? record._latitude,
    longitude: record.longitude ?? record._longitude,
  };
}

export function coordinatesFromLocationRecord(
  record?: LocationRecordLike | null
): LocationCoordinates | undefined {
  if (!record) return undefined;
  const nested = nestedCoordinateValues(record.coordinates);
  const latitude = finiteCoordinate(record.latitude ?? nested.latitude);
  const longitude = finiteCoordinate(record.longitude ?? nested.longitude);
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

export function locationAddress(record?: LocationRecordLike | null): string {
  if (!record) return '';
  return String(record.normalizedAddress || record.rawAddress || record.address || '').trim();
}

export function locationPlaceId(record?: LocationRecordLike | null): string {
  if (!record) return '';
  return String(record.googlePlaceId || record.placeId || '').trim();
}

export function addressLocationKey(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  return normalizeCanadianAddress(raw).normalizedAddress
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b[a-z]\d[a-z]\s*\d[a-z]\d\b/gi, ' ')
    .replace(/\b(prince edward island|p\.?e\.?i\.?|p\.?e\.?|canada)\b/gi, ' ')
    .replace(/\b(street|st)\b/g, ' st ')
    .replace(/\b(road|rd)\b/g, ' rd ')
    .replace(/\b(avenue|ave)\b/g, ' ave ')
    .replace(/\b(drive|dr)\b/g, ' dr ')
    .replace(/\b(highway|hwy)\b/g, ' hwy ')
    .replace(/\b(route|rte)\b/g, ' rte ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function addressesLikelyEquivalent(left: unknown, right: unknown): boolean {
  const leftKey = addressLocationKey(left);
  const rightKey = addressLocationKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function coordinateDistanceMeters(
  left: LocationCoordinates,
  right: LocationCoordinates
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6371008.8;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function assessVenueLocationCandidate(
  input: VenueLocationCandidateInput
): LocationCoherenceAssessment {
  const existingCoordinates = coordinatesFromLocationRecord(input.existing);
  const candidateCoordinates = coordinatesFromLocationRecord(input.candidate);
  const existingPlaceId = locationPlaceId(input.existing);
  const candidatePlaceId = locationPlaceId(input.candidate);
  const expectedAddress = String(input.expectedAddress || locationAddress(input.existing)).trim();
  const candidateAddress = String(
    input.candidateAddress || locationAddress(input.candidate)
  ).trim();
  const reasons: string[] = [];
  let moveDistanceMeters: number | undefined;

  if (candidateCoordinates) {
    const regionCheck = checkEventCoordinatesAgainstAllowedRegions(
      candidateCoordinates,
      input.allowedRegionCodes
    );
    if (regionCheck.decision === 'reject') {
      reasons.push('coordinates_outside_allowed_regions');
    }

    if (existingCoordinates) {
      moveDistanceMeters = coordinateDistanceMeters(existingCoordinates, candidateCoordinates);
      const maximumMove = input.maximumAutomaticMoveMeters ?? MAXIMUM_AUTOMATIC_VENUE_MOVE_METERS;
      if (moveDistanceMeters > maximumMove) {
        reasons.push('coordinate_move_requires_manual_review');
      }
    }
  }

  const candidateHasLocationIdentity = Boolean(candidateCoordinates || candidatePlaceId);
  if (
    candidateHasLocationIdentity &&
    expectedAddress &&
    candidateAddress &&
    !addressesLikelyEquivalent(expectedAddress, candidateAddress)
  ) {
    reasons.push('candidate_address_conflicts_with_canonical_address');
  }

  if (existingPlaceId && candidatePlaceId && existingPlaceId !== candidatePlaceId) {
    reasons.push('google_place_id_change_requires_manual_review');
  }

  return {
    decision: reasons.length > 0 ? 'reject' : 'accept',
    reasons: Array.from(new Set(reasons)),
    existingCoordinates,
    candidateCoordinates,
    moveDistanceMeters,
  };
}

export function resolveVenueScopedEventLocation(
  input: VenueScopedEventLocationInput
): VenueScopedEventLocationResult {
  const eventAddress = locationAddress(input.event);
  const venueAddress = locationAddress(input.venue);
  const eventCoordinates = coordinatesFromLocationRecord(input.event);
  const venueCoordinates = coordinatesFromLocationRecord(input.venue);

  if (
    eventAddress &&
    venueAddress &&
    addressesLikelyEquivalent(eventAddress, venueAddress) &&
    venueCoordinates
  ) {
    return {
      decision: 'accept',
      reasons: eventCoordinates && coordinateDistanceMeters(eventCoordinates, venueCoordinates) > 1
        ? ['event_coordinates_replaced_with_canonical_venue_coordinates']
        : [],
      coordinates: venueCoordinates,
      source: 'venue',
    };
  }

  if (eventCoordinates) {
    const regionCheck = checkEventCoordinatesAgainstAllowedRegions(
      eventCoordinates,
      input.allowedRegionCodes
    );
    if (regionCheck.decision === 'reject') {
      return {
        decision: 'reject',
        reasons: ['event_coordinates_outside_allowed_regions'],
        coordinates: eventCoordinates,
        source: 'event',
      };
    }
    return {
      decision: 'accept',
      reasons: [],
      coordinates: eventCoordinates,
      source: 'event',
    };
  }

  return {
    decision: 'accept',
    reasons: [],
    source: 'none',
  };
}

export function synchronizedCoordinateFields(coordinates: LocationCoordinates): {
  latitude: number;
  longitude: number;
  coordinates: LocationCoordinates;
} {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    coordinates: { ...coordinates },
  };
}
