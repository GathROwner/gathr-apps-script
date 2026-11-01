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
export const CHECK_IN_PREPARATION_SOURCE_MAX_AGE_MS = 6 * 60 * 60_000;
export const CHECK_IN_PREPARATION_REFRESH_MS = 10 * 60_000;
const PREPARATION_POOL_MODE = 'nearby_preparation_pool_v1';
const PREPARATION_AREA_METRES = 20;
const MAX_RETURNED_CANDIDATES = 5;
const MAX_RESERVED_EXTERNAL_CANDIDATES = 2;
const MAX_CANONICAL_VENUES_SCANNED = 500;
const MAX_PREPARED_EXTERNAL_CANDIDATES = 20;
// Keep provider fetch + body work inside the existing 25s client / 30s
// callable limits, including time already spent preparing canonical venues.
const DISCOVERY_PROVIDER_DEADLINE_MS = 22_000;
const PROVIDER_TOTAL_BUDGET_MS = 20_000;
// Public Overpass may normally queue for15s before a short query executes.
// Give the primary that opportunity, then use only the shared remainder for
// fallback. Keep an explicitly configured operator's existing10s behavior.
const PROVIDER_PRIMARY_BUDGET_MS = 16_000;
const PROVIDER_CONFIGURED_BUDGET_MS = 10_000;
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
  // Public OSM identity for exact re-resolution across short-lived UUIDs.
  // This is not authorization; bind/create still require the candidate ID.
  locationKey?: string;
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
  renewPreparationPool?: unknown;
}

export interface CheckInPreparationPool {
  id: string;
  expiresAtMs: number;
  refreshAtMs: number;
  sourceExpiresAtMs: number;
  originLatitude: number;
  originLongitude: number;
}

export interface NearbyCheckInPreparationResult {
  candidates: NearbyCheckInPlaceCandidate[];
  expiresAt: Timestamp;
  externalLookupStatus: 'complete' | 'partial_unavailable';
  preparationRadiusMetres?: 175;
  preparationPool?: CheckInPreparationPool;
  preparationReused?: boolean;
  catalogSource?: string;
  catalogVersion?: string;
  catalogSourceTimestamp?: string;
  catalogReason?: string;
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
  legacyListingRadiusMetres?: number,
  fresh = false
): Promise<NearbyCheckInPlaceCandidate[]> {
  const documents = preparation
    ? await preparedCanonicalVenueRecords(db, latitude, now.toMillis(), fresh)
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

export function checkInPreparationPoolDocumentId(uid: string): string {
  // Deliberately not a UUID/candidate. Existing server-only rules and TTL apply.
  return `${uid}__nearby_preparation_pool`;
}

function preparationLease(id: string, latitude: number, longitude: number, nowMs: number,
  sourceExpiresAtMs: number): CheckInPreparationPool {
  const expiresAtMs = Math.min(nowMs + CHECK_IN_PLACE_CANDIDATE_TTL_MS, sourceExpiresAtMs);
  return {id, expiresAtMs, refreshAtMs: Math.min(nowMs + CHECK_IN_PREPARATION_REFRESH_MS, expiresAtMs),
    sourceExpiresAtMs, originLatitude: latitude, originLongitude: longitude};
}

function candidateIdentity(candidate: DocumentData): string {
  const place = record(candidate.place);
  return createHash('sha256').update(JSON.stringify([candidate.source, candidate.osmElementKeyHash,
    candidate.catalogSource ?? null, candidate.catalogVersion ?? null, candidate.catalogSourceTimestamp ?? null,
    place.type, place.locationKey, place.name, place.address, place.category, place.latitude, place.longitude,
    candidate.checkInBoundary ?? null])).digest('hex');
}

function renewalRefusal(condition: 'rediscovery_required' | 'preparation_renewal_unqualified'): never {
  throw new SocialDomainError('failed-precondition', condition === 'rediscovery_required'
    ? 'Prepare nearby public places again.' : 'A fresh qualified arrival is needed to keep nearby places ready.',
  {condition, retryable: true});
}

/** Renew existing identities only. This path has no provider or discovery fallback. */
export async function renewNearbyCheckInPreparation(
  uidValue: unknown,
  input: NearbyPlaceInput,
  options: {db?: Firestore; now?: Timestamp} = {}
): Promise<NearbyCheckInPreparationResult> {
  const uid = validateUid(uidValue, 'uid');
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  const nowMs = now.toMillis();
  const request = record(input.renewPreparationPool);
  const poolId = validateSocialOperationId(request.poolId);
  const sessionId = validateSocialOperationId(request.readinessSessionId);
  let location: ReturnType<typeof parseFreshNearbyLocation>;
  try { location = parseFreshNearbyLocation(input, now); }
  catch { return renewalRefusal('preparation_renewal_unqualified'); }
  if (input.preparation !== true || location.accuracyMeters > 50)
    renewalRefusal('preparation_renewal_unqualified');
  const poolRef = db.collection('checkInPlaceCandidates').doc(checkInPreparationPoolDocumentId(uid));
  const sessionRef = db.collection('checkInEligibilitySessions').doc(`${uid}_${sessionId}`);
  const ownerRef = db.collection('checkInEligibilitySessions').doc(`${uid}__readiness_owner`);
  const activeRef = db.collection('activeCheckIns').doc(uid);
  let canonicalPromise: Promise<NearbyCheckInPlaceCandidate[]> | undefined;
  return db.runTransaction(async transaction => {
    const [poolSnapshot, sessionSnapshot, ownerSnapshot, activeSnapshot] = await transaction.getAll(
      poolRef, sessionRef, ownerRef, activeRef);
    const pool = poolSnapshot.data() || {};
    const session = sessionSnapshot.data() || {};
    const owner = ownerSnapshot.data() || {};
    const unexpired = (value: unknown) => value instanceof Timestamp && value.toMillis() > nowMs;
    const fresh = (value: unknown) => value instanceof Timestamp
      && value.toMillis() >= nowMs - CHECK_IN_PLACE_LOCATION_MAX_AGE_MS && value.toMillis() <= nowMs;
    const arrival = storedQualifiedArrival(session.arrival, sessionId, nowMs);
    const activeExpiry = activeSnapshot.data()?.expiresAt;
    const hasActiveCheckIn = activeSnapshot.exists
      && (!(activeExpiry instanceof Timestamp) || activeExpiry.toMillis() > nowMs);
    if (session.uid !== uid || session.mode !== 'prequalification_v1' || session.boundAt || session.consumedAt
      || !unexpired(session.expiresAt) || !arrival || Number(session.hereQualifyingMs) < 30_000
      || !fresh(session.lastSeenAt) || !fresh(session.lastHereQualifyingAt)
      || !Number.isFinite(session.lastCapturedAtMs) || session.lastCapturedAtMs < nowMs - CHECK_IN_PLACE_LOCATION_MAX_AGE_MS
      || session.lastCapturedAtMs > nowMs + 10_000
      || !Number.isFinite(session.lastAccuracyMeters) || session.lastAccuracyMeters < 0 || session.lastAccuracyMeters > 50
      || owner.uid !== uid || owner.mode !== 'prequalification_owner_v1' || owner.activeSessionId !== sessionId
      || !unexpired(owner.expiresAt) || hasActiveCheckIn) renewalRefusal('preparation_renewal_unqualified');
    const ids = pool.candidateIds;
    const identities = record(pool.identities);
    if (pool.uid !== uid || pool.mode !== PREPARATION_POOL_MODE || pool.poolId !== poolId
      || !unexpired(pool.expiresAt) || !(pool.discoveredAt instanceof Timestamp)
      || pool.discoveredAt.toMillis() > nowMs || nowMs - pool.discoveredAt.toMillis() >= CHECK_IN_PREPARATION_SOURCE_MAX_AGE_MS
      || !Array.isArray(ids) || ids.length > MAX_PREPARED_EXTERNAL_CANDIDATES || new Set(ids).size !== ids.length
      || !ids.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id) && /^[a-f0-9]{64}$/.test(String(identities[id])))
      || !Number.isFinite(pool.latitude) || Math.abs(pool.latitude) > 90
      || !Number.isFinite(pool.longitude) || Math.abs(pool.longitude) > 180) renewalRefusal('rediscovery_required');
    const origin = {latitude: pool.latitude as number, longitude: pool.longitude as number};
    const close = (latitude: unknown, longitude: unknown) => typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && distanceMetres(origin.latitude, origin.longitude, latitude, longitude) <= PREPARATION_AREA_METRES;
    if (!close(location.latitude, location.longitude) || !close(arrival.latitude, arrival.longitude)
      || !close(session.lastLatitude, session.lastLongitude)) renewalRefusal('rediscovery_required');
    let catalogReason: string | undefined;
    if (pool.catalogSource === 'osm_regional_snapshot') {
      const {lookupPeiOsmCatalogue} = await import('./peiOsmCatalogue.js');
      const catalogue = lookupPeiOsmCatalogue(origin, nowMs);
      if (catalogue.status !== 'complete' || catalogue.version !== pool.catalogVersion
        || catalogue.sourceTimestamp !== pool.catalogSourceTimestamp) renewalRefusal('rediscovery_required');
      catalogReason = catalogue.reason;
    }
    const refs = (ids as string[]).map(id => db.collection('checkInPlaceCandidates').doc(id));
    const snapshots = refs.length ? await transaction.getAll(...refs) : [];
    const external: NearbyCheckInPlaceCandidate[] = snapshots.map((snapshot, index) => {
      const candidate = snapshot.data() || {};
      let place: ExternalCheckInPlaceSnapshot;
      try { place = validateExternalCheckInPlaceCandidate(candidate, uid, ids[index], now); }
      catch { return renewalRefusal('rediscovery_required'); }
      if (candidateIdentity(candidate) !== identities[ids[index]]) renewalRefusal('rediscovery_required');
      const boundary = parseCheckInBoundary(candidate.checkInBoundary);
      return {id: ids[index], ...place, distanceMetres: Math.round(checkInPlaceDistance(origin, place, boundary)),
        ...(boundary ? {checkInBoundary: boundary} : {})};
    });
    // Revalidate current canonical records with the existing bounded numeric +
    // legacy queries. Preserve the ORIGINAL covered circle, not a shifted175m claim.
    canonicalPromise ??= nearbyCanonicalVenues(db, origin.latitude, origin.longitude, location.accuracyMeters,
      now, true, undefined, true);
    const canonical = await canonicalPromise;
    const preparationPool = preparationLease(poolId, origin.latitude, origin.longitude, nowMs,
      pool.discoveredAt.toMillis() + CHECK_IN_PREPARATION_SOURCE_MAX_AGE_MS);
    const expiresAt = Timestamp.fromMillis(preparationPool.expiresAtMs);
    refs.forEach(ref => transaction.update(ref, {expiresAt}));
    transaction.update(poolRef, {expiresAt, lastPresenceAt: now});
    return {candidates: [...canonical, ...external].sort((a, b) => a.distanceMetres - b.distanceMetres), expiresAt,
      externalLookupStatus: 'complete', preparationRadiusMetres: CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES,
      preparationPool, preparationReused: true,
      ...(pool.catalogSource ? {catalogSource: pool.catalogSource} : {}),
      ...(pool.catalogVersion ? {catalogVersion: pool.catalogVersion} : {}),
      ...(pool.catalogSourceTimestamp ? {catalogSourceTimestamp: pool.catalogSourceTimestamp} : {}),
      ...(catalogReason ? {catalogReason} : {})};
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
    // Internal dependency-control for provider-path regression tests only.
    // This option is never accepted from a callable request.
    useBundledCatalogue?: boolean;
  } = {}
): Promise<NearbyCheckInPreparationResult> {
  if (input.renewPreparationPool !== undefined) {
    // Defense in depth for direct domain callers: never let a renewal flag
    // silently invoke the expensive ordinary provider path.
    return renewNearbyCheckInPreparation(uidValue, input, options);
  }
  const uid = validateUid(uidValue, 'uid');
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  const { latitude, longitude, accuracyMeters } = parseFreshNearbyLocation(input, now);
  const expiresAt = Timestamp.fromMillis(now.toMillis() + CHECK_IN_PLACE_CANDIDATE_TTL_MS);
  const preparation = input.preparation === true;
  const discoveryStartedAt = Date.now();
  const canonical = await nearbyCanonicalVenues(db, latitude, longitude, accuracyMeters, now, preparation);
  let payload: unknown;
  let catalogMetadata: {catalogSource?: string; catalogVersion?: string; catalogSourceTimestamp?: string; catalogReason?: string} = {};
  if (options.useBundledCatalogue !== false) {
    // Lazy load: readiness/private functions also import the validators in this
    // module and must not load a regional dataset merely to validate a target.
    const {lookupPeiOsmCatalogue} = await import('./peiOsmCatalogue.js');
    const catalogue = lookupPeiOsmCatalogue({latitude, longitude}, now.toMillis());
    if (catalogue.status !== 'outside_coverage') {
      catalogMetadata = {catalogSource: 'osm_regional_snapshot',
        ...(catalogue.version ? {catalogVersion: catalogue.version} : {}),
        ...(catalogue.sourceTimestamp ? {catalogSourceTimestamp: catalogue.sourceTimestamp} : {}),
        ...(catalogue.reason ? {catalogReason: catalogue.reason} : {})};
      if (catalogue.status === 'complete') payload = {elements: catalogue.elements};
      else {
        // A covered but corrupt/invalid/incomplete catalogue is an explicit
        // failure; never hide a live-provider dependency inside covered PEI.
        if (preparation || canonical.length) return {candidates: preparation ? canonical : canonical.slice(0, MAX_RETURNED_CANDIDATES),
          expiresAt, externalLookupStatus: 'partial_unavailable', ...catalogMetadata, catalogReason: catalogue.reason,
          ...(preparation ? {preparationRadiusMetres: CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES} : {})};
        throw new SocialDomainError('unavailable', 'Nearby public places could not be loaded right now.', {
          condition: 'nearby_public_places_catalogue_unavailable', retryable: false,
        });
      }
    }
  }
  // Outside this pilot extract, retain the existing explicitly bounded free
  // Overpass path. This is not a permanent PEI-only location restriction.
  if (payload === undefined) {
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
  for (const [index, endpoint] of endpoints.entries()) {
    const remainingMs = providerDeadlineAt - Date.now() - PROVIDER_DIAGNOSTIC_RESERVE_MS;
    if (remainingMs <= 0) break;
    const attemptBudgetMs = configuredEndpoint ? PROVIDER_CONFIGURED_BUDGET_MS
      : index === 0 ? PROVIDER_PRIMARY_BUDGET_MS : remainingMs;
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
        signal: AbortSignal.timeout(Math.min(attemptBudgetMs, remainingMs)),
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
  const identities: Record<string, string> = {};
  const externalCandidates = selectedExternal.map((candidate) => {
    const candidateId = randomUUID();
    const stored = {
      uid,
      candidateId,
      source: 'openstreetmap_overpass',
      // Legacy source is the existing external-OSM candidate protocol tag;
      // truthful origin/version metadata avoids breaking old bind/create images.
      ...catalogMetadata,
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
    };
    identities[candidateId] = candidateIdentity(stored);
    batch.set(db.collection('checkInPlaceCandidates').doc(candidateId), stored);
    return {
      id: candidateId,
      type: candidate.type,
      locationKey: candidate.locationKey,
      name: candidate.name,
      address: candidate.address,
      category: candidate.category,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      distanceMetres: candidate.distanceMetres,
      ...(candidate.checkInBoundary ? { checkInBoundary: candidate.checkInBoundary } : {}),
    } satisfies NearbyCheckInPlaceCandidate;
  });
  const preparationPool = preparation ? preparationLease(randomUUID(), latitude, longitude, now.toMillis(),
    now.toMillis() + CHECK_IN_PREPARATION_SOURCE_MAX_AGE_MS) : undefined;
  if (preparationPool) batch.set(db.collection('checkInPlaceCandidates').doc(checkInPreparationPoolDocumentId(uid)), {
    uid, mode: PREPARATION_POOL_MODE, poolId: preparationPool.id, latitude, longitude,
    candidateIds: externalCandidates.map(candidate => candidate.id), identities,
    ...catalogMetadata, discoveredAt: now, lastPresenceAt: now, expiresAt,
  });
  if (selectedExternal.length > 0 || preparationPool) await batch.commit();
  const candidates = [...selectedCanonical, ...externalCandidates]
    .sort((left, right) => left.distanceMetres - right.distanceMetres
      || (left.type === 'gathr_venue' ? -1 : 1));
  return { candidates, expiresAt, externalLookupStatus: 'complete', ...catalogMetadata,
    ...(preparationPool ? {preparationPool, preparationReused: false} : {}),
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
