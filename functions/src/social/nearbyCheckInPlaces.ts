import { createHash, randomUUID } from 'node:crypto';

import {
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

import { SocialDomainError, validateUid, validateSocialOperationId } from './validation.js';
import { storedQualifiedArrival } from './checkInArrival.js';
import { preparedCanonicalVenueRecords } from './checkInVenueQuery.js';
import { buildSocialRateLimitRecord } from './socialRateLimit.js';
import { checkInPlaceDistance, parseCheckInBoundary, publicCheckInRadius, type BoundaryPoint } from './checkInPlaceGeometry.js';
import { logProviderHttpFailure, logProviderException, logProviderPayloadFailure, type FailureLogger, type ProviderAlias } from './nearbyPlaceDiagnostics.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const CHECK_IN_PLACE_CANDIDATE_TTL_MS = 15 * 60_000;
export const CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES = 175;
export const CHECK_IN_PLACE_MAX_ACCURACY_METRES = 100;
export const CHECK_IN_PLACE_LOCATION_MAX_AGE_MS = 60_000;
const MAX_RETURNED_CANDIDATES = 5;
const MAX_RESERVED_EXTERNAL_CANDIDATES = 2;
const MAX_CANONICAL_VENUES_SCANNED = 500;
const MAX_PREPARED_EXTERNAL_CANDIDATES = 20;
// Keep provider fetch + body work inside the existing 25s client / 30s
// callable limits, including time already spent preparing canonical venues.
const DISCOVERY_PROVIDER_DEADLINE_MS = 22_000;
const PROVIDER_TOTAL_BUDGET_MS = 20_000;
const PROVIDER_ATTEMPT_BUDGET_MS = 10_000;
const PROVIDER_DIAGNOSTIC_RESERVE_MS = 100;

export interface ExternalCheckInPlaceSnapshot {
  type: 'external_place';
  locationKey: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
}

export interface PrivateCheckInPlaceSnapshot {
  type: 'private_place';
  locationKey: string;
  name: string;
  category: 'Private location';
  latitude: number;
  longitude: number;
}

export type CheckInPlaceSnapshot = ExternalCheckInPlaceSnapshot | PrivateCheckInPlaceSnapshot;

export interface NearbyCheckInPlaceCandidate {
  id: string;
  type: 'gathr_venue' | 'external_place' | 'private_place';
  venueId?: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
  checkInBoundary?: BoundaryPoint[];
}

interface ParsedExternalPlace extends ExternalCheckInPlaceSnapshot {
  checkInBoundary?: BoundaryPoint[];
  osmElementKey: string;
  distanceMetres: number;
}

interface NearbyPlaceInput {
  latitude?: unknown;
  longitude?: unknown;
  accuracyMeters?: unknown;
  capturedAtMs?: unknown;
  preparation?: unknown;
}

interface PrivatePlaceInput extends NearbyPlaceInput {
  label?: unknown;
  readinessSessionId?: unknown;
}

const PRIVATE_PLACE_PRESET_LABELS = new Set([
  'Home',
  "Friend's place",
  'Private gathering',
  'Private place',
]);

function parsePrivatePlaceLabel(value: unknown): string {
  const label = cleanText(value, 40) || 'Private place';
  if (PRIVATE_PLACE_PRESET_LABELS.has(label)) return label;
  const looksLikeAddress = /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i.test(label)
    || /\b\d{1,6}\s+[\p{L}.'-]+(?:\s+[\p{L}.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|boulevard|blvd|highway|hwy)\b/iu.test(label);
  if (looksLikeAddress) {
    throw new SocialDomainError(
      'invalid-argument',
      'Use a private-place label, not a street address.'
    );
  }
  if (label.length < 2) {
    throw new SocialDomainError('invalid-argument', 'Private-place label is too short.');
  }
  return label;
}

function parseFreshNearbyLocation(
  input: NearbyPlaceInput,
  now: Timestamp
): { latitude: number; longitude: number; accuracyMeters: number } {
  const latitude = finiteCoordinate(input.latitude, -90, 90, 'latitude');
  const longitude = finiteCoordinate(input.longitude, -180, 180, 'longitude');
  const accuracyMeters = finiteCoordinate(input.accuracyMeters, 0, 10_000, 'accuracyMeters');
  if (accuracyMeters > CHECK_IN_PLACE_MAX_ACCURACY_METRES) {
    throw new SocialDomainError('failed-precondition', 'A more accurate location is needed nearby.');
  }
  const capturedAtMs = Number(input.capturedAtMs);
  if (
    !Number.isFinite(capturedAtMs)
    || capturedAtMs < now.toMillis() - CHECK_IN_PLACE_LOCATION_MAX_AGE_MS
    || capturedAtMs > now.toMillis() + 10_000
  ) {
    throw new SocialDomainError('failed-precondition', 'Refresh your location and try again.');
  }
  return { latitude, longitude, accuracyMeters };
}

export function selectNearbyPlaceCandidateSlots<TCanonical, TExternal>(
  canonical: TCanonical[],
  external: TExternal[],
  maximum = MAX_RETURNED_CANDIDATES
): { canonical: TCanonical[]; external: TExternal[] } {
  const reservedExternalCount = Math.min(external.length, MAX_RESERVED_EXTERNAL_CANDIDATES, maximum);
  const selectedCanonical = canonical.slice(0, maximum - reservedExternalCount);
  const remainingSlots = maximum - selectedCanonical.length;
  return {
    canonical: selectedCanonical,
    external: external.slice(0, remainingSlots),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new SocialDomainError('invalid-argument', `${label} is invalid.`);
  }
  return parsed;
}

function distanceMetres(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMetres = 6_371_000;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = radians(firstLatitude);
  const secondLatitudeRadians = radians(secondLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitudeRadians)
    * Math.cos(secondLatitudeRadians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(haversine));
}

function normalizedMatchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function firstCategory(tags: Record<string, unknown>): string {
  return cleanText(
    tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || tags.craft,
    80
  ).replace(/_/g, ' ') || 'Place';
}

function osmAddress(tags: Record<string, unknown>): string {
  const streetAddress = [cleanText(tags['addr:housenumber'], 30), cleanText(tags['addr:street'], 120)]
    .filter(Boolean)
    .join(' ');
  return [
    streetAddress,
    cleanText(tags['addr:city'], 100),
    cleanText(tags['addr:province'], 100) || cleanText(tags['addr:state'], 100),
    cleanText(tags['addr:postcode'], 30),
  ].filter(Boolean).join(', ');
}

const DISALLOWED_PUBLIC_PLACE_TERMS = [
  'address',
  'apartment',
  'condominium',
  'dormitory',
  'home',
  'house',
  'private residence',
  'residential',
];

export function parsePublicNearbyPlaces(
  payload: unknown,
  origin: { latitude: number; longitude: number; accuracyMeters?: number; preparation?: boolean }
): ParsedExternalPlace[] {
  const elements = Array.isArray(record(payload).elements)
    ? record(payload).elements as unknown[]
    : [];
  const seen = new Set<string>();
  const parsed: ParsedExternalPlace[] = [];
  for (const rawElement of elements) {
    const element = record(rawElement);
    const tags = record(element.tags);
    const center = record(element.center);
    const elementType = cleanText(element.type, 20).toLocaleLowerCase();
    const elementId = cleanText(
      typeof element.id === 'number' ? String(element.id) : element.id,
      60
    );
    if (!['node', 'way', 'relation'].includes(elementType)) continue;
    const name = cleanText(tags.name, 120);
    const address = osmAddress(tags);
    const hasPublicPlaceTag = Boolean(cleanText(
      tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || tags.craft,
      80
    ));
    const category = firstCategory(tags);
    const checkInBoundary = elementType === 'way' && tags.area !== 'no'
      ? parseCheckInBoundary(element.geometry) : undefined;
    // Overpass geom output may supply bounds instead of center. Use bounds only
    // for the display pin; eligibility still uses the complete closed footprint.
    const bounds = record(element.bounds);
    const boundaryLatitudes = checkInBoundary?.map(point => point.lat) || [];
    const boundaryLongitudes = checkInBoundary?.map(point => point.lon) || [];
    const minLat = Number(bounds.minlat ?? (checkInBoundary ? Math.min(...boundaryLatitudes) : NaN));
    const maxLat = Number(bounds.maxlat ?? (checkInBoundary ? Math.max(...boundaryLatitudes) : NaN));
    const minLon = Number(bounds.minlon ?? (checkInBoundary ? Math.min(...boundaryLongitudes) : NaN));
    const maxLon = Number(bounds.maxlon ?? (checkInBoundary ? Math.max(...boundaryLongitudes) : NaN));
    const latitude = Number(element.lat ?? center.lat ?? (minLat + maxLat) / 2);
    const longitude = Number(element.lon ?? center.lon ?? (minLon + maxLon) / 2);
    if (
      !elementId || !name || !hasPublicPlaceTag
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) continue;
    const publicDescriptor = normalizedMatchText(category);
    if (DISALLOWED_PUBLIC_PLACE_TERMS.some((term) => publicDescriptor.includes(term))) continue;
    const distance = checkInPlaceDistance(origin, { latitude, longitude }, checkInBoundary);
    if (distance > (origin.preparation ? CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES : publicCheckInRadius(origin.accuracyMeters || 0))) continue;
    const dedupeKey = `${normalizedMatchText(name)}|${normalizedMatchText(address) || elementType + elementId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const osmElementKey = `${elementType}:${elementId}`;
    parsed.push({
      type: 'external_place',
      osmElementKey,
      ...(checkInBoundary ? { checkInBoundary } : {}),
      locationKey: `external:${createHash('sha256').update(osmElementKey).digest('hex').slice(0, 32)}`,
      name,
      address: address || 'Address not listed',
      category,
      latitude,
      longitude,
      distanceMetres: Math.round(distance),
    });
  }
  return parsed.sort((left, right) => left.distanceMetres - right.distanceMetres);
}

function canonicalVenueAvailable(venue: DocumentData, now: Timestamp): boolean {
  if (venue.socialVenueMirrorSource !== 'gathr-event-api') return true;
  const expiry = venue.socialVenueMirrorExpiresAt;
  return expiry instanceof Timestamp && expiry.toMillis() > now.toMillis();
}

async function nearbyCanonicalVenues(
  db: Firestore,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
  now: Timestamp,
  preparation = false,
  legacyListingRadiusMetres?: number
): Promise<NearbyCheckInPlaceCandidate[]> {
  const documents = preparation
    ? await preparedCanonicalVenueRecords(db, latitude, now.toMillis())
    : (await db.collection('venues').limit(MAX_CANONICAL_VENUES_SCANNED).get()).docs
      .map(document => ({id: document.id, data: document.data()}));
  const candidates: NearbyCheckInPlaceCandidate[] = [];
  for (const document of documents) {
    const venue = document.data;
    if (!canonicalVenueAvailable(venue, now)) continue;
    const venueLatitude = Number(venue.latitude);
    const venueLongitude = Number(venue.longitude);
    if (
      !Number.isFinite(venueLatitude) || venueLatitude < -90 || venueLatitude > 90
      || !Number.isFinite(venueLongitude) || venueLongitude < -180 || venueLongitude > 180
    ) continue;
    const distance = distanceMetres(latitude, longitude, venueLatitude, venueLongitude);
    const radius = preparation ? CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES
      : legacyListingRadiusMetres ?? publicCheckInRadius(accuracyMeters);
    if (distance > radius) continue;
    candidates.push({
      id: `venue:${document.id}`,
      type: 'gathr_venue',
      venueId: document.id,
      name: cleanText(venue.pagename || venue.title || venue.name, 120) || 'GathR venue',
      address: cleanText(venue.address, 300),
      category: 'GathR venue',
      latitude: venueLatitude,
      longitude: venueLongitude,
      distanceMetres: Math.round(distance),
    });
  }
  return candidates.sort((left, right) => left.distanceMetres - right.distanceMetres);
}

/**
 * Lists known GathR venues only. This path deliberately does not contact
 * OpenStreetMap; external discovery is a separate, explicit user action.
 */
export async function listNearbyCanonicalCheckInVenues(
  input: NearbyPlaceInput,
  options: { db?: Firestore; now?: Timestamp } = {}
): Promise<{ candidates: NearbyCheckInPlaceCandidate[]; expiresAt: Timestamp; preparationRadiusMetres?: 175 }> {
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  const { latitude, longitude, accuracyMeters } = parseFreshNearbyLocation(input, now);
  return {
    candidates: await nearbyCanonicalVenues(db, latitude, longitude, accuracyMeters, now, input.preparation === true,
      CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES + accuracyMeters),
    expiresAt: Timestamp.fromMillis(now.toMillis() + CHECK_IN_PLACE_CANDIDATE_TTL_MS),
    ...(input.preparation === true ? {preparationRadiusMetres: CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES} : {}),
  };
}

function externalMatchesCanonical(
  external: ParsedExternalPlace,
  canonical: NearbyCheckInPlaceCandidate[]
): boolean {
  const externalName = normalizedMatchText(external.name);
  return canonical.some((venue) => {
    const namesMatch = normalizedMatchText(venue.name) === externalName;
    const closeTogether = distanceMetres(
      venue.latitude,
      venue.longitude,
      external.latitude,
      external.longitude
    ) <= 40;
    return namesMatch || closeTogether && normalizedMatchText(venue.address) === normalizedMatchText(external.address);
  });
}

export async function discoverNearbyCheckInPlaces(
  uidValue: unknown,
  input: NearbyPlaceInput,
  options: {
    db?: Firestore;
    fetchImpl?: FetchLike;
    now?: Timestamp;
    overpassEndpoint?: string;
    providerFailureLogger?: FailureLogger;
  } = {}
): Promise<{ candidates: NearbyCheckInPlaceCandidate[]; expiresAt: Timestamp; externalLookupStatus: 'complete' | 'partial_unavailable'; preparationRadiusMetres?: 175 }> {
  const uid = validateUid(uidValue, 'uid');
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  const { latitude, longitude, accuracyMeters } = parseFreshNearbyLocation(input, now);
  const expiresAt = Timestamp.fromMillis(now.toMillis() + CHECK_IN_PLACE_CANDIDATE_TTL_MS);
  const preparation = input.preparation === true;
  const discoveryStartedAt = Date.now();
  const canonical = await nearbyCanonicalVenues(db, latitude, longitude, accuracyMeters, now, preparation);
  const overpassQuery = `[out:json][timeout:8];(`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["amenity"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["shop"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["tourism"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["leisure"];`
    + `);out center geom;`;
  const configuredEndpoint = options.overpassEndpoint || process.env.OVERPASS_API_ENDPOINT;
  const endpoints = configuredEndpoint
    ? [configuredEndpoint]
    : [
      'https://overpass-api.de/api/interpreter',
      // The same former Kumi operator now documents this direct hostname.
      'https://overpass.private.coffee/api/interpreter',
    ];
  const providerDeadlineAt = Math.min(discoveryStartedAt + DISCOVERY_PROVIDER_DEADLINE_MS,
    Date.now() + PROVIDER_TOTAL_BUDGET_MS);
  let payload: unknown;
  for (const [index, endpoint] of endpoints.entries()) {
    const remainingMs = providerDeadlineAt - Date.now() - PROVIDER_DIAGNOSTIC_RESERVE_MS;
    if (remainingMs <= 0) break;
    const provider: ProviderAlias = configuredEndpoint ? 'configured' : index === 0 ? 'overpass_de' : 'overpass_kumi';
    const startedAt = Date.now();
    let stage: 'request' | 'json' = 'request';
    let status: number | null = null;
    try {
      const response = await (options.fetchImpl || fetch)(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'GathRPreview/1.1 (support@gathr.app)',
        },
        body: new URLSearchParams({ data: overpassQuery }),
        // The signal remains attached through JSON body consumption, not only
        // response headers. Failure-body diagnostics have their own100ms cap.
        signal: AbortSignal.timeout(Math.min(PROVIDER_ATTEMPT_BUDGET_MS, remainingMs)),
      });
      status = response.status;
      if (!response.ok) {
        await logProviderHttpFailure(provider, response, startedAt, options.providerFailureLogger);
        continue;
      }
      stage = 'json';
      const decoded: unknown = await response.json();
      if (Date.now() >= providerDeadlineAt) throw new DOMException('Provider preparation deadline exceeded.', 'TimeoutError');
      const result = record(decoded);
      // Overpass streams runtime errors inside HTTP200 JSON, potentially with
      // partial elements. Neither errors nor malformed JSON shapes prove that
      // all nearby public places were prepared. A genuine empty array does.
      if (!Array.isArray(result.elements)
        || result.remark !== undefined && (typeof result.remark !== 'string' || result.remark.trim())) {
        logProviderPayloadFailure(provider, response.status, decoded, startedAt, options.providerFailureLogger);
        continue;
      }
      payload = decoded;
      break;
    } catch (error) {
      // Public Preview providers have no SLA. Try the next configured endpoint
      // without logging coordinates or other user location data.
      logProviderException(provider, stage, status, error, startedAt, options.providerFailureLogger);
    }
  }
  if (payload === undefined) {
    // Keep independently usable GathR options during a public-provider failure.
    if (preparation || canonical.length) return { candidates: preparation ? canonical : canonical.slice(0, MAX_RETURNED_CANDIDATES),
      expiresAt, externalLookupStatus: 'partial_unavailable',
      ...(preparation ? {preparationRadiusMetres: CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES} : {}) };
    throw new SocialDomainError('unavailable', 'Nearby public places could not be loaded right now.', {
      condition: 'nearby_public_places_external_lookup_unavailable', retryable: true,
    });
  }
  const external = parsePublicNearbyPlaces(payload, { latitude, longitude, accuracyMeters, preparation })
    .filter((candidate) => !externalMatchesCanonical(candidate, canonical));
  // A dense downtown can easily fill all five slots with existing GathR venues.
  // Keep room for nearby public places so an unknown venue is actually selectable.
  const selected = preparation
    ? { canonical, external: external.slice(0, MAX_PREPARED_EXTERNAL_CANDIDATES) }
    : selectNearbyPlaceCandidateSlots(canonical, external);
  const selectedCanonical = selected.canonical;
  const selectedExternal = selected.external;
  const batch = db.batch();
  const externalCandidates = selectedExternal.map((candidate) => {
    const candidateId = randomUUID();
    batch.set(db.collection('checkInPlaceCandidates').doc(candidateId), {
      uid,
      candidateId,
      source: 'openstreetmap_overpass',
      ...(candidate.checkInBoundary ? { checkInBoundary: candidate.checkInBoundary } : {}),
      osmElementKeyHash: createHash('sha256').update(candidate.osmElementKey).digest('hex'),
      place: {
        type: candidate.type,
        locationKey: candidate.locationKey,
        name: candidate.name,
        address: candidate.address,
        category: candidate.category,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      },
      createdAt: now,
      expiresAt,
    });
    return {
      id: candidateId,
      type: candidate.type,
      name: candidate.name,
      address: candidate.address,
      category: candidate.category,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      distanceMetres: candidate.distanceMetres,
      ...(candidate.checkInBoundary ? { checkInBoundary: candidate.checkInBoundary } : {}),
    } satisfies NearbyCheckInPlaceCandidate;
  });
  if (selectedExternal.length > 0) await batch.commit();
  const candidates = [...selectedCanonical, ...externalCandidates]
    .sort((left, right) => left.distanceMetres - right.distanceMetres
      || (left.type === 'gathr_venue' ? -1 : 1));
  return { candidates, expiresAt, externalLookupStatus: 'complete',
    ...(preparation ? {preparationRadiusMetres: CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES} : {}) };
}

export async function createPrivateCheckInPlaceCandidate(
  uidValue: unknown,
  input: PrivatePlaceInput,
  options: { db?: Firestore; now?: Timestamp } = {}
): Promise<{
  candidate: NearbyCheckInPlaceCandidate & { type: 'private_place' };
  expiresAt: Timestamp;
}> {
  const uid = validateUid(uidValue, 'uid');
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  let location: { latitude: number; longitude: number };
  if (input.readinessSessionId !== undefined) {
    const sessionId = validateSocialOperationId(input.readinessSessionId);
    const [sessionSnapshot, ownerSnapshot] = await db.getAll(
      db.collection('checkInEligibilitySessions').doc(`${uid}_${sessionId}`),
      db.collection('checkInEligibilitySessions').doc(`${uid}__readiness_owner`)
    );
    const session = sessionSnapshot.data() || {};
    const owner = ownerSnapshot.data() || {};
    const arrival = storedQualifiedArrival(session.arrival, sessionId, now.toMillis());
    if (session.uid !== uid || session.mode !== 'prequalification_v1'
      || session.consumedAt || session.boundAt || !arrival
      || owner.uid !== uid || owner.mode !== 'prequalification_owner_v1'
      || owner.activeSessionId !== sessionId
      || !(owner.expiresAt instanceof Timestamp) || owner.expiresAt.toMillis() <= now.toMillis()) {
      throw new SocialDomainError('failed-precondition', 'Your prepared arrival expired. Refresh your location before choosing a private place.');
    }
    location = arrival;
  } else {
    location = parseFreshNearbyLocation(input, now);
  }
  const { latitude, longitude } = location;
  const name = parsePrivatePlaceLabel(input.label);
  const candidateId = randomUUID();
  const locationKey = `private:${createHash('sha256').update(candidateId).digest('hex').slice(0, 32)}`;
  const expiresAt = Timestamp.fromMillis(now.toMillis() + CHECK_IN_PLACE_CANDIDATE_TTL_MS);
  const candidateRef = db.collection('checkInPlaceCandidates').doc(candidateId);
  const rateLimitRef = db.collection('socialRateLimits').doc(`${uid}_private_check_in_place_candidate`);
  await db.runTransaction(async (transaction) => {
    const rateLimitSnapshot = await transaction.get(rateLimitRef);
    const rateLimit = buildSocialRateLimitRecord(uid, 'private_check_in_place_candidate', 20, 60 * 60_000,
      rateLimitSnapshot.data() || {}, now, 'Please wait before trying again.');
    transaction.set(rateLimitRef, rateLimit);
    transaction.set(candidateRef, {
      uid,
      candidateId,
      source: 'user_private_place',
      place: {
        type: 'private_place',
        locationKey,
        name,
        category: 'Private location',
        latitude,
        longitude,
      },
      createdAt: now,
      expiresAt,
    });
  });
  return {
    candidate: {
      id: candidateId,
      type: 'private_place',
      name,
      address: '',
      category: 'Private location',
      latitude,
      longitude,
      distanceMetres: 0,
    },
    expiresAt,
  };
}

export function validateExternalCheckInPlaceCandidate(
  candidate: DocumentData,
  uid: string,
  candidateId: string,
  now: Timestamp
): ExternalCheckInPlaceSnapshot {
  const expiry = candidate.expiresAt;
  const place = record(candidate.place);
  if (
    candidate.uid !== uid
    || candidate.candidateId !== candidateId
    || candidate.source !== 'openstreetmap_overpass'
    || !(expiry instanceof Timestamp)
    || expiry.toMillis() <= now.toMillis()
    || candidate.consumedAt
    || place.type !== 'external_place'
  ) {
    throw new SocialDomainError('failed-precondition', 'Refresh nearby places and select this place again.');
  }
  const name = cleanText(place.name, 120);
  const address = cleanText(place.address, 300);
  const category = cleanText(place.category, 80) || 'Place';
  const locationKey = cleanText(place.locationKey, 80);
  const latitude = finiteCoordinate(place.latitude, -90, 90, 'candidate latitude');
  const longitude = finiteCoordinate(place.longitude, -180, 180, 'candidate longitude');
  if (!name || !address || !/^external:[a-f0-9]{32}$/.test(locationKey)) {
    throw new SocialDomainError('failed-precondition', 'Refresh nearby places and select this place again.');
  }
  return { type: 'external_place', locationKey, name, address, category, latitude, longitude };
}

export function validateCheckInPlaceCandidate(
  candidate: DocumentData,
  uid: string,
  candidateId: string,
  now: Timestamp
): CheckInPlaceSnapshot {
  const expiry = candidate.expiresAt;
  const place = record(candidate.place);
  if (
    candidate.uid !== uid
    || candidate.candidateId !== candidateId
    || !(expiry instanceof Timestamp)
    || expiry.toMillis() <= now.toMillis()
    || candidate.consumedAt
  ) {
    throw new SocialDomainError('failed-precondition', 'Refresh this check-in place and try again.');
  }
  if (candidate.source === 'openstreetmap_overpass') {
    return validateExternalCheckInPlaceCandidate(candidate, uid, candidateId, now);
  }
  if (candidate.source !== 'user_private_place' || place.type !== 'private_place') {
    throw new SocialDomainError('failed-precondition', 'Refresh this check-in place and try again.');
  }
  const name = parsePrivatePlaceLabel(place.name);
  const locationKey = cleanText(place.locationKey, 80);
  const latitude = finiteCoordinate(place.latitude, -90, 90, 'candidate latitude');
  const longitude = finiteCoordinate(place.longitude, -180, 180, 'candidate longitude');
  if (!/^private:[a-f0-9]{32}$/.test(locationKey)) {
    throw new SocialDomainError('failed-precondition', 'Refresh this check-in place and try again.');
  }
  return {
    type: 'private_place',
    locationKey,
    name,
    category: 'Private location',
    latitude,
    longitude,
  };
}

export function approximatePrivateLocation(
  latitudeValue: unknown,
  longitudeValue: unknown,
  cellSizeMetres = 750
): { latitude: number; longitude: number } {
  const latitude = finiteCoordinate(latitudeValue, -90, 90, 'latitude');
  const longitude = finiteCoordinate(longitudeValue, -180, 180, 'longitude');
  const boundedCellSize = Math.max(500, Math.min(1_500, cellSizeMetres));
  const latitudeStep = boundedCellSize / 111_320;
  const longitudeStep = boundedCellSize
    / (111_320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  const snappedLatitude = (Math.floor(latitude / latitudeStep) + 0.5) * latitudeStep;
  const snappedLongitude = (Math.floor(longitude / longitudeStep) + 0.5) * longitudeStep;
  return {
    latitude: Number(snappedLatitude.toFixed(6)),
    longitude: Number(snappedLongitude.toFixed(6)),
  };
}

export async function cleanupExpiredCheckInPlaceCandidates(
  now: Timestamp = Timestamp.now(),
  db: Firestore = getFirestore(),
  limit = 200
): Promise<{ cleaned: number }> {
  const snapshot = await db.collection('checkInPlaceCandidates')
    .where('expiresAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 400)))
    .get();
  if (snapshot.empty) return { cleaned: 0 };
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return { cleaned: snapshot.size };
}
