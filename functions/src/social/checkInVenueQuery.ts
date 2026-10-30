import type { DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { SocialDomainError } from './validation.js';

export const PREPARED_VENUE_RADIUS_METRES = 175;
export const PREPARED_NUMERIC_QUERY_RADIUS_METRES = 200;
export const PREPARED_NUMERIC_QUERY_LIMIT = 1_000;
export const PREPARED_LEGACY_QUERY_LIMIT = 500;
export const PREPARED_VENUE_QUERY_CACHE_TTL_MS = 5 * 60_000;
const MAX_NUMERIC_CACHE_BANDS = 8;

export interface PublicCanonicalVenueRecord { id: string; data: DocumentData }
interface CachedRecords {
  expiresAtMs: number;
  records?: PublicCanonicalVenueRecord[];
  promise?: Promise<PublicCanonicalVenueRecord[]>;
}
interface CachedNumericBand extends CachedRecords { lower: number; upper: number }
const numericBands = new WeakMap<Firestore, CachedNumericBand[]>();
const legacyStrings = new WeakMap<Firestore, CachedRecords>();

/** 110km/degree is conservative for latitude everywhere, including at the poles. */
function latitudeBounds(latitude: number, metres: number) {
  const delta = metres / 110_000;
  return {lower: Math.max(-90, latitude - delta), upper: Math.min(90, latitude + delta)};
}

function incomplete(): never {
  throw new SocialDomainError('unavailable', 'GathR venues could not be fully prepared. Please try again later.',
    {condition: 'nearby_gathr_venues_incomplete', retryable: true});
}

function publicRecords(documents: QueryDocumentSnapshot[]): PublicCanonicalVenueRecord[] {
  // Cache only fields needed by this public venue picker, not whole venue records.
  return documents.map(document => {
    const venue = document.data();
    return {id: document.id, data: {
      pagename: venue.pagename, title: venue.title, name: venue.name, address: venue.address,
      latitude: venue.latitude, longitude: venue.longitude,
      socialVenueMirrorSource: venue.socialVenueMirrorSource,
      socialVenueMirrorExpiresAt: venue.socialVenueMirrorExpiresAt,
    }};
  });
}

async function numericRecords(db: Firestore, latitude: number, nowMs: number): Promise<PublicCanonicalVenueRecord[]> {
  const required = latitudeBounds(latitude, PREPARED_VENUE_RADIUS_METRES);
  const bands = (numericBands.get(db) || []).filter(band => band.expiresAtMs > nowMs);
  numericBands.set(db, bands);
  const existing = bands.find(band => band.lower <= required.lower && band.upper >= required.upper);
  if (existing?.records) return existing.records;
  if (existing?.promise) return existing.promise;
  const bounds = latitudeBounds(latitude, PREPARED_NUMERIC_QUERY_RADIUS_METRES);
  const entry: CachedNumericBand = {...bounds, expiresAtMs: nowMs + PREPARED_VENUE_QUERY_CACHE_TTL_MS};
  const promise = (async () => {
    // Only one field is constrained: the existing automatic latitude index is
    // sufficient. Index errors fail closed; never fall back to a catalog scan.
    const snapshot = await db.collection('venues').where('latitude', '>=', bounds.lower)
      .where('latitude', '<=', bounds.upper).limit(PREPARED_NUMERIC_QUERY_LIMIT + 1).get();
    if (snapshot.docs.length > PREPARED_NUMERIC_QUERY_LIMIT) incomplete();
    const records = publicRecords(snapshot.docs);
    entry.records = records;
    entry.promise = undefined;
    return records;
  })();
  entry.promise = promise;
  bands.push(entry);
  if (bands.length > MAX_NUMERIC_CACHE_BANDS) bands.shift();
  try { return await promise; }
  catch (error) {
    numericBands.set(db, (numericBands.get(db) || []).filter(band => band !== entry));
    throw error;
  }
}

async function legacyRecords(db: Firestore, nowMs: number): Promise<PublicCanonicalVenueRecord[]> {
  const existing = legacyStrings.get(db);
  if (existing && existing.expiresAtMs > nowMs) {
    if (existing.records) return existing.records;
    if (existing.promise) return existing.promise;
  }
  const entry: CachedRecords = {expiresAtMs: nowMs + PREPARED_VENUE_QUERY_CACHE_TTL_MS};
  const promise = (async () => {
    // Firestore inequalities compare only matching backend types. The empty
    // string is the lowest string, so this includes every legacy string latitude
    // (including whitespace/exponent formats accepted by Number), but no numbers.
    const snapshot = await db.collection('venues').where('latitude', '>=', '')
      .limit(PREPARED_LEGACY_QUERY_LIMIT + 1).get();
    if (snapshot.docs.length > PREPARED_LEGACY_QUERY_LIMIT) incomplete();
    const records = publicRecords(snapshot.docs);
    entry.records = records;
    entry.promise = undefined;
    return records;
  })();
  entry.promise = promise;
  legacyStrings.set(db, entry);
  try { return await promise; }
  catch (error) {
    if (legacyStrings.get(db) === entry) legacyStrings.delete(db);
    throw error;
  }
}

/** Complete number|string coverage, with bounded reads and reusable proven bounds. */
export async function preparedCanonicalVenueRecords(db: Firestore, latitude: number, nowMs: number): Promise<PublicCanonicalVenueRecord[]> {
  const [numeric, legacy] = await Promise.all([numericRecords(db, latitude, nowMs), legacyRecords(db, nowMs)]);
  // A normalizer can convert a cached legacy document to numeric coordinates
  // before that legacy cache expires. Prefer the numeric record and emit one ID.
  const records = new Map(numeric.map(record => [record.id, record]));
  for (const record of legacy) if (!records.has(record.id)) records.set(record.id, record);
  return [...records.values()];
}
