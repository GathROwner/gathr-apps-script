import { SocialDomainError } from './validation.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FriendEventAddressSuggestion {
  id: string;
  primaryText: string;
  secondaryText: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function addressText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 300)
    : '';
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function featureText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 300) : '';
}

/**
 * Return a small, temporary autocomplete list for the authenticated event
 * creator. Address text, result labels, and coordinates are deliberately not
 * logged or written by this function.
 */
export async function suggestFriendEventAddresses(
  input: Record<string, unknown>,
  accessToken: string,
  options: { fetchImpl?: FetchLike } = {}
): Promise<{ suggestions: FriendEventAddressSuggestion[] }> {
  const query = addressText(input.query).slice(0, 200);
  if (query.length < 3) return { suggestions: [] };

  const normalizedAccessToken = accessToken.trim();
  if (!normalizedAccessToken) {
    throw new SocialDomainError(
      'failed-precondition',
      'Address suggestions are temporarily unavailable.'
    );
  }

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', query);
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('limit', '5');
  url.searchParams.set('types', 'address');
  url.searchParams.set('access_token', normalizedAccessToken);

  const proximityLatitude = finiteCoordinate(input.proximityLatitude, -90, 90);
  const proximityLongitude = finiteCoordinate(input.proximityLongitude, -180, 180);
  if (proximityLatitude !== null && proximityLongitude !== null) {
    url.searchParams.set('proximity', `${proximityLongitude},${proximityLatitude}`);
  }

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SocialDomainError(
      'unavailable',
      'Address suggestions are temporarily unavailable.'
    );
  }
  if (!response.ok) {
    throw new SocialDomainError(
      'unavailable',
      'Address suggestions are temporarily unavailable.'
    );
  }

  const body = await response.json() as {
    features?: Array<{
      id?: unknown;
      geometry?: { coordinates?: unknown[] };
      properties?: {
        mapbox_id?: unknown;
        name?: unknown;
        name_preferred?: unknown;
        place_formatted?: unknown;
        full_address?: unknown;
        coordinates?: { latitude?: unknown; longitude?: unknown };
      };
    }>;
  };
  const seen = new Set<string>();
  const suggestions: FriendEventAddressSuggestion[] = [];
  for (const feature of body.features || []) {
    const properties = feature.properties || {};
    const primaryText = featureText(properties.name_preferred) || featureText(properties.name);
    const secondaryText = featureText(properties.place_formatted);
    const fullAddress = featureText(properties.full_address)
      || [primaryText, secondaryText].filter(Boolean).join(', ');
    const latitude = finiteCoordinate(
      properties.coordinates?.latitude ?? feature.geometry?.coordinates?.[1],
      -90,
      90
    );
    const longitude = finiteCoordinate(
      properties.coordinates?.longitude ?? feature.geometry?.coordinates?.[0],
      -180,
      180
    );
    const dedupeKey = fullAddress.toLocaleLowerCase();
    if (
      !primaryText
      || !fullAddress
      || latitude === null
      || longitude === null
      || seen.has(dedupeKey)
    ) continue;
    seen.add(dedupeKey);
    suggestions.push({
      id: featureText(properties.mapbox_id) || featureText(feature.id) || dedupeKey,
      primaryText,
      secondaryText,
      fullAddress,
      latitude,
      longitude,
    });
  }

  return { suggestions: suggestions.slice(0, 5) };
}

/**
 * Resolve a custom event address on the trusted server boundary. Coordinates
 * supplied by the app are treated as preview-only and replaced in production.
 * The address and returned coordinates are never logged here.
 */
export async function resolveFriendEventAddress(
  input: Record<string, unknown>,
  accessToken: string,
  options: { fetchImpl?: FetchLike; allowTrustedCoordinates?: boolean } = {}
): Promise<Record<string, unknown>> {
  const location = record(input.location);
  if (!location || location.type !== 'custom_address') return input;

  const normalizedAccessToken = accessToken.trim();

  if (!normalizedAccessToken) {
    if (options.allowTrustedCoordinates === true) return input;
    throw new SocialDomainError(
      'failed-precondition',
      'Private address verification is temporarily unavailable.'
    );
  }

  const address = addressText(location.address);
  if (address.length < 5) {
    throw new SocialDomainError('invalid-argument', 'Enter a complete event address.');
  }

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', address);
  url.searchParams.set('limit', '1');
  // Final custom-event coordinates are stored in the private canonical
  // location record. Autocomplete remains temporary, but this final lookup
  // must use Mapbox's permanent geocoding mode.
  url.searchParams.set('permanent', 'true');
  // Mapbox Geocoding v6 rejects the legacy `poi` type. Event place names are
  // still accepted as free-form query text, while these supported result types
  // cover exact homes, streets, cities, and localities.
  url.searchParams.set('types', 'address,street,place,locality');
  url.searchParams.set('access_token', normalizedAccessToken);

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SocialDomainError(
      'unavailable',
      'The address could not be verified right now. Try again shortly.'
    );
  }
  if (!response.ok) {
    throw new SocialDomainError(
      'unavailable',
      'The address could not be verified right now. Try again shortly.'
    );
  }

  const body = await response.json() as { features?: Array<{ geometry?: { coordinates?: unknown[] } }> };
  const coordinates = body.features?.[0]?.geometry?.coordinates;
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    throw new SocialDomainError(
      'invalid-argument',
      'That address could not be located. Add a city or postal code and try again.'
    );
  }

  return {
    ...input,
    location: {
      ...location,
      address,
      latitude,
      longitude,
    },
  };
}
