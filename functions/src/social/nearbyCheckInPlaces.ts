import { createHash, randomUUID } from 'node:crypto';

import {
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

import { SocialDomainError, validateUid } from './validation.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const CHECK_IN_PLACE_CANDIDATE_TTL_MS = 15 * 60_000;
export const CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES = 175;
export const CHECK_IN_PLACE_MAX_ACCURACY_METRES = 100;
export const CHECK_IN_PLACE_LOCATION_MAX_AGE_MS = 60_000;
const MAX_RETURNED_CANDIDATES = 5;
const MAX_CANONICAL_VENUES_SCANNED = 500;

export interface ExternalCheckInPlaceSnapshot {
  type: 'external_place';
  locationKey: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
}

export interface NearbyCheckInPlaceCandidate {
  id: string;
  type: 'gathr_venue' | 'external_place';
  venueId?: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
}

interface ParsedExternalPlace extends ExternalCheckInPlaceSnapshot {
  osmElementKey: string;
  distanceMetres: number;
}

interface NearbyPlaceInput {
  latitude?: unknown;
  longitude?: unknown;
  accuracyMeters?: unknown;
  capturedAtMs?: unknown;
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
  origin: { latitude: number; longitude: number }
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
    const latitude = Number(element.lat ?? center.lat);
    const longitude = Number(element.lon ?? center.lon);
    if (
      !elementId || !name || !hasPublicPlaceTag
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) continue;
    const publicDescriptor = normalizedMatchText(category);
    if (DISALLOWED_PUBLIC_PLACE_TERMS.some((term) => publicDescriptor.includes(term))) continue;
    const distance = distanceMetres(origin.latitude, origin.longitude, latitude, longitude);
    if (distance > CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES) continue;
    const dedupeKey = `${normalizedMatchText(name)}|${normalizedMatchText(address) || elementType + elementId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const osmElementKey = `${elementType}:${elementId}`;
    parsed.push({
      type: 'external_place',
      osmElementKey,
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
  now: Timestamp
): Promise<NearbyCheckInPlaceCandidate[]> {
  const snapshot = await db.collection('venues').limit(MAX_CANONICAL_VENUES_SCANNED).get();
  const candidates: NearbyCheckInPlaceCandidate[] = [];
  for (const document of snapshot.docs) {
    const venue = document.data();
    if (!canonicalVenueAvailable(venue, now)) continue;
    const venueLatitude = Number(venue.latitude);
    const venueLongitude = Number(venue.longitude);
    if (
      !Number.isFinite(venueLatitude) || venueLatitude < -90 || venueLatitude > 90
      || !Number.isFinite(venueLongitude) || venueLongitude < -180 || venueLongitude > 180
    ) continue;
    const distance = distanceMetres(latitude, longitude, venueLatitude, venueLongitude);
    if (distance > CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES + accuracyMeters) continue;
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
  } = {}
): Promise<{ candidates: NearbyCheckInPlaceCandidate[]; expiresAt: Timestamp }> {
  const uid = validateUid(uidValue, 'uid');
  const latitude = finiteCoordinate(input.latitude, -90, 90, 'latitude');
  const longitude = finiteCoordinate(input.longitude, -180, 180, 'longitude');
  const accuracyMeters = finiteCoordinate(input.accuracyMeters, 0, 10_000, 'accuracyMeters');
  if (accuracyMeters > CHECK_IN_PLACE_MAX_ACCURACY_METRES) {
    throw new SocialDomainError('failed-precondition', 'A more accurate location is needed nearby.');
  }
  const db = options.db || getFirestore();
  const now = options.now || Timestamp.now();
  const capturedAtMs = Number(input.capturedAtMs);
  if (
    !Number.isFinite(capturedAtMs)
    || capturedAtMs < now.toMillis() - CHECK_IN_PLACE_LOCATION_MAX_AGE_MS
    || capturedAtMs > now.toMillis() + 10_000
  ) {
    throw new SocialDomainError('failed-precondition', 'Refresh your location to find nearby places.');
  }
  const expiresAt = Timestamp.fromMillis(now.toMillis() + CHECK_IN_PLACE_CANDIDATE_TTL_MS);
  const canonical = await nearbyCanonicalVenues(db, latitude, longitude, accuracyMeters, now);
  const overpassQuery = `[out:json][timeout:8];(`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["amenity"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["shop"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["tourism"];`
    + `nwr(around:${CHECK_IN_PLACE_DISCOVERY_RADIUS_METRES},${latitude},${longitude})["name"]["leisure"];`
    + `);out center tags;`;
  const endpoint = options.overpassEndpoint
    || process.env.OVERPASS_API_ENDPOINT
    || 'https://overpass-api.de/api/interpreter';
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'GathRPreview/1.1 (support@gathr.app)',
      },
      body: new URLSearchParams({ data: overpassQuery }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SocialDomainError('unavailable', 'Nearby places could not be loaded right now.');
  }
  if (!response.ok) {
    throw new SocialDomainError('unavailable', 'Nearby places could not be loaded right now.');
  }
  const external = parsePublicNearbyPlaces(await response.json(), { latitude, longitude })
    .filter((candidate) => !externalMatchesCanonical(candidate, canonical));
  const selectedCanonical = canonical.slice(0, MAX_RETURNED_CANDIDATES);
  const slots = MAX_RETURNED_CANDIDATES - selectedCanonical.length;
  const selectedExternal = external.slice(0, slots);
  const batch = db.batch();
  const externalCandidates = selectedExternal.map((candidate) => {
    const candidateId = randomUUID();
    batch.set(db.collection('checkInPlaceCandidates').doc(candidateId), {
      uid,
      candidateId,
      source: 'openstreetmap_overpass',
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
    } satisfies NearbyCheckInPlaceCandidate;
  });
  if (selectedExternal.length > 0) await batch.commit();
  return { candidates: [...selectedCanonical, ...externalCandidates], expiresAt };
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
