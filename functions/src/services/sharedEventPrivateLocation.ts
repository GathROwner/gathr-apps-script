import { ParsedSharedEvent } from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';
import { searchPlace } from './placesService.js';

type PlaceResult = Awaited<ReturnType<typeof searchPlace>>;

function normalizeAddress(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(road|rd)\b/g, 'rd')
    .replace(/\b(drive|dr)\b/g, 'dr')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(prince edward island|pei)\b/g, 'pe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function placeResultMatchesSharedAddress(address: string, result: PlaceResult): boolean {
  if (!result) return false;
  const expected = normalizeAddress(address);
  const actual = normalizeAddress(result.formattedAddress);
  const expectedNumber = expected.match(/^\s*(\d+[a-z]?)/)?.[1];
  const actualNumber = actual.match(/^\s*(\d+[a-z]?)/)?.[1];
  if (!expectedNumber || expectedNumber !== actualNumber) return false;

  const expectedTokens = expected.split(' ').slice(1);
  const streetName = expectedTokens.find((token) => (
    token.length >= 3 && !['street', 'road', 'drive', 'avenue', 'lane', 'court', 'st', 'rd', 'dr', 'ave', 'ln', 'ct'].includes(token)
  ));
  if (!streetName || !actual.split(' ').includes(streetName)) return false;

  const latitude = Number(result.location?.lat);
  const longitude = Number(result.location?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);
}

export async function enrichPrivateSharedEventLocation(
  event: ParsedSharedEvent,
  lookup: typeof searchPlace = searchPlace
): Promise<ParsedSharedEvent> {
  const address = String(event.address || '').trim();
  if (!address || (Number.isFinite(event.latitude) && Number.isFinite(event.longitude))) {
    return event;
  }

  try {
    const result = await lookup(address, { preferFirstResult: true });
    if (!placeResultMatchesSharedAddress(address, result)) {
      logger.warn('Shared event private address geocode was not an exact street match', {
        tag: 'shared_event_private_location',
        hasResult: Boolean(result),
      });
      return event;
    }
    return {
      ...event,
      latitude: result!.location.lat,
      longitude: result!.location.lng,
      locationPrecision: 'exact',
      locationScope: event.locationScope || 'unknown',
      mapMode: event.mapMode || 'venue',
    };
  } catch (error) {
    logger.warn('Shared event private address geocode failed', {
      tag: 'shared_event_private_location',
      error: error instanceof Error ? error.message : String(error),
    });
    return event;
  }
}
