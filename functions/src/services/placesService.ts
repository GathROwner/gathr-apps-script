/**
 * Google Places Service
 * Handles venue lookup and place details retrieval
 */

import { google } from 'googleapis';
import { PlaceSearchResult, PlaceDetails, OperatingHours, DayHours } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Default search parameters for PEI
const DEFAULT_LOCATION = { lat: 46.2382, lng: -63.1311 }; // Charlottetown, PEI
const DEFAULT_RADIUS = 50000; // 50km - covers most of PEI

let placesClient: ReturnType<typeof google.places> | null = null;

const VENUE_PREFERRED_TYPES = new Set([
  'bar',
  'night_club',
  'restaurant',
  'cafe',
  'meal_takeaway',
  'meal_delivery',
  'lodging',
  'stadium',
  'movie_theater',
  'library',
  'museum',
  'university',
  'tourist_attraction',
  'event_venue',
  'establishment',
]);

const VENUE_DEPRIORITIZED_TYPES = new Set([
  'store',
  'home_goods_store',
  'clothing_store',
  'electronics_store',
  'furniture_store',
  'shoe_store',
  'hardware_store',
]);

export interface SharedEventPlaceCandidate extends PlaceSearchResult {
  confidence: number;
}

function normalizePlaceName(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function placeNameConfidence(queryName: string, candidateName: string, typeScore: number): number {
  const expected = normalizePlaceName(queryName);
  const actual = normalizePlaceName(candidateName);
  if (!expected || !actual) return 0.35;
  if (expected === actual) return Math.min(0.99, 0.96 + Math.max(0, typeScore) * 0.005);
  if (expected.includes(actual) || actual.includes(expected)) {
    return Math.min(0.94, 0.86 + Math.max(0, typeScore) * 0.01);
  }

  const expectedTokens = new Set(expected.split(' ').filter((token) => token.length > 1));
  const actualTokens = new Set(actual.split(' ').filter((token) => token.length > 1));
  const shared = [...expectedTokens].filter((token) => actualTokens.has(token)).length;
  const union = new Set([...expectedTokens, ...actualTokens]).size || 1;
  const overlap = shared / union;
  return Math.max(0.3, Math.min(0.85, 0.42 + overlap * 0.38 + Math.max(-2, typeScore) * 0.015));
}

function scorePlaceForVenueMatch(place: {
  types?: string[] | null;
  displayName?: { text?: string | null } | null;
}): number {
  const types = Array.isArray(place.types)
    ? place.types.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const name = String(place.displayName?.text || '').trim().toLowerCase();

  let score = 0;
  for (const type of types) {
    if (VENUE_PREFERRED_TYPES.has(type)) score += 2;
    if (VENUE_DEPRIORITIZED_TYPES.has(type)) score -= 2;
  }
  if (/\b(pub|bar|brew|restaurant|cafe|lounge|theatre|theater|hall|centre|center|club)\b/i.test(name)) {
    score += 2;
  }
  if (/craft|supply|supplies|gift|boutique/.test(name)) {
    score -= 2;
  }
  return score;
}

function getClient(): ReturnType<typeof google.places> {
  if (!placesClient) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY environment variable not set');
    }
    placesClient = google.places({ version: 'v1', auth: apiKey });
  }
  return placesClient;
}

/**
 * Search for a place by text query
 */
export async function searchPlace(
  query: string,
  options?: {
    location?: { lat: number; lng: number };
    radius?: number;
    types?: string[];
    preferFirstResult?: boolean;
  }
): Promise<PlaceSearchResult | null> {
  const candidates = await searchPlaceCandidates(query, {
    ...options,
    queryName: query,
  });
  if (candidates.length === 0) return null;
  return candidates[0];
}

export async function searchPlaceCandidates(
  query: string,
  options?: {
    location?: { lat: number; lng: number };
    radius?: number;
    types?: string[];
    preferFirstResult?: boolean;
    queryName?: string;
    limit?: number;
  }
): Promise<SharedEventPlaceCandidate[]> {
  const client = getClient();
  const location = options?.location || DEFAULT_LOCATION;
  const radius = options?.radius || DEFAULT_RADIUS;

  try {
    // Use Places API (new) text search
    const response = await client.places.searchText({
      requestBody: {
        textQuery: query,
        locationBias: {
          circle: {
            center: {
              latitude: location.lat,
              longitude: location.lng,
            },
            radius: radius,
          },
        },
        includedType: options?.types?.[0], // New API accepts single type
        maxResultCount: Math.max(1, Math.min(5, options?.limit || 5)),
      },
      fields: 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus',
    });

    const places = response.data.places;
    if (!places || places.length === 0) {
      logger.debug('No places found for query', { query });
      return [];
    }

    const ranked = places.map((place, index) => {
      const typeScore = scorePlaceForVenueMatch(place);
      return {
        index,
        typeScore,
        result: {
          placeId: place.id || '',
          name: place.displayName?.text || '',
          formattedAddress: place.formattedAddress || '',
          location: {
            lat: place.location?.latitude || 0,
            lng: place.location?.longitude || 0,
          },
          types: place.types || [],
          businessStatus: place.businessStatus ?? undefined,
          confidence: placeNameConfidence(
            options?.queryName || query,
            place.displayName?.text || '',
            typeScore
          ),
        } satisfies SharedEventPlaceCandidate,
      };
    });

    if (!options?.preferFirstResult) {
      ranked.sort((left, right) => {
        if (right.result.confidence !== left.result.confidence) {
          return right.result.confidence - left.result.confidence;
        }
        if (right.typeScore !== left.typeScore) return right.typeScore - left.typeScore;
        return left.index - right.index;
      });
    }

    return ranked.map(({ result }) => result);
  } catch (error) {
    logger.error('Places search failed', error, { query });
    return [];
  }
}

/**
 * Get detailed information about a place
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  const client = getClient();

  try {
    const response = await client.places.get({
      name: `places/${placeId}`,
      fields: 'id,displayName,formattedAddress,location,types,businessStatus,nationalPhoneNumber,websiteUri,currentOpeningHours,rating,userRatingCount',
    });

    const place = response.data;
    if (!place) {
      return null;
    }

    // Parse opening hours
    let openingHours: PlaceDetails['openingHours'] | undefined;
    if (place.currentOpeningHours) {
      openingHours = {
        weekdayText: place.currentOpeningHours.weekdayDescriptions || [],
        periods: (place.currentOpeningHours.periods || []).map(period => ({
          open: {
            day: period.open?.day || 0,
            time: formatPlacesTime(period.open?.hour ?? undefined, period.open?.minute ?? undefined),
          },
          close: period.close ? {
            day: period.close.day || 0,
            time: formatPlacesTime(period.close.hour ?? undefined, period.close.minute ?? undefined),
          } : undefined,
        })),
      };
    }

    return {
      placeId: place.id || placeId,
      name: place.displayName?.text || '',
      formattedAddress: place.formattedAddress || '',
      formattedPhoneNumber: place.nationalPhoneNumber ?? undefined,
      website: place.websiteUri ?? undefined,
      location: place.location
        ? {
            lat: place.location.latitude || 0,
            lng: place.location.longitude || 0,
          }
        : undefined,
      types: Array.isArray(place.types) ? place.types.filter(Boolean) as string[] : undefined,
      businessStatus: place.businessStatus ?? undefined,
      openingHours,
      rating: place.rating ?? undefined,
      userRatingsTotal: place.userRatingCount ?? undefined,
    };
  } catch (error) {
    logger.error('Get place details failed', error, { placeId });
    return null;
  }
}

/**
 * Format Places API time (hour, minute) to HH:MM string
 */
function formatPlacesTime(hour?: number, minute?: number): string {
  const h = hour ?? 0;
  const m = minute ?? 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Convert Places API opening hours to our OperatingHours format
 */
export function convertToOperatingHours(
  placeDetails: PlaceDetails
): OperatingHours | null {
  if (!placeDetails.openingHours?.periods) {
    return null;
  }

  const dayNames: Array<keyof OperatingHours> = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];

  const hours: OperatingHours = {};

  for (const period of placeDetails.openingHours.periods) {
    const dayIndex = period.open.day;
    const dayName = dayNames[dayIndex];

    if (!dayName) continue;

    const dayHours: DayHours = {
      open: period.open.time,
      close: period.close?.time || '23:59',
    };

    hours[dayName] = dayHours;
  }

  // Mark days without entries as closed
  for (const dayName of dayNames) {
    if (!hours[dayName]) {
      hours[dayName] = { open: '', close: '', closed: true };
    }
  }

  return hours;
}

/**
 * Find a venue by name and optionally address
 */
export async function findVenue(
  name: string,
  address?: string
): Promise<{
  placeResult: PlaceSearchResult | null;
  details: PlaceDetails | null;
  operatingHours: OperatingHours | null;
}> {
  // Build search query
  const query = address ? `${name} ${address}` : `${name} PEI`;

  const placeResult = await searchPlace(query, {
    types: ['restaurant', 'bar', 'night_club', 'cafe', 'establishment'],
  });

  if (!placeResult) {
    return { placeResult: null, details: null, operatingHours: null };
  }

  const details = await getPlaceDetails(placeResult.placeId);
  const operatingHours = details ? convertToOperatingHours(details) : null;

  return { placeResult, details, operatingHours };
}

/**
 * Get operating hours for a specific day
 */
export function getHoursForDay(
  hours: OperatingHours,
  day: string
): DayHours | null {
  const dayLower = day.toLowerCase() as keyof OperatingHours;
  return hours[dayLower] || null;
}

/**
 * Check if a venue is open at a specific time
 */
export function isVenueOpen(
  hours: OperatingHours,
  day: string,
  time: string
): boolean {
  const dayHours = getHoursForDay(hours, day);

  if (!dayHours || dayHours.closed) {
    return false;
  }

  const checkTime = parseInt(time.replace(':', ''), 10);
  const openTime = parseInt(dayHours.open.replace(':', ''), 10);
  const closeTime = parseInt(dayHours.close.replace(':', ''), 10);

  // Handle overnight hours (close time is next day)
  if (closeTime < openTime) {
    return checkTime >= openTime || checkTime < closeTime;
  }

  return checkTime >= openTime && checkTime < closeTime;
}

/**
 * Get default closing time based on venue category
 */
export function getDefaultClosingTime(category: string): string {
  const categoryDefaults: Record<string, string> = {
    bar: '02:00',
    night_club: '02:00',
    pub: '01:00',
    restaurant: '22:00',
    cafe: '21:00',
    default: '23:00',
  };

  return categoryDefaults[category.toLowerCase()] || categoryDefaults.default;
}
