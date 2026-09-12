import { SocialDomainError } from './validation.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FriendEventLocationSuggestion {
  id: string;
  mapboxId: string;
  primaryText: string;
  secondaryText: string;
  fullAddress: string;
  featureType: string;
}

export interface ResolvedFriendEventLocationSuggestion {
  mapboxId: string;
  primaryText: string;
  fullAddress: string;
  featureType: string;
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

function searchSessionToken(value: unknown): string {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9-]{8,100}$/.test(token)) {
    throw new SocialDomainError('invalid-argument', 'The location search session is invalid.');
  }
  return token;
}

function mapboxId(value: unknown): string {
  const id = featureText(value);
  if (!id || id.length > 500 || !/^[A-Za-z0-9_:=.-]+$/.test(id)) {
    throw new SocialDomainError('invalid-argument', 'The selected location is invalid.');
  }
  return id;
}

/**
 * Return a small, temporary autocomplete list for the authenticated event
 * creator. Search Box supports businesses and other POIs as well as ordinary
 * addresses. Result labels are deliberately not logged or written here.
 */
export async function suggestFriendEventLocations(
  input: Record<string, unknown>,
  accessToken: string,
  options: { fetchImpl?: FetchLike } = {}
): Promise<{ suggestions: FriendEventLocationSuggestion[] }> {
  const query = addressText(input.query).slice(0, 200);
  if (query.length < 3) return { suggestions: [] };
  const sessionToken = searchSessionToken(input.sessionToken);

  const normalizedAccessToken = accessToken.trim();
  if (!normalizedAccessToken) {
    throw new SocialDomainError(
      'failed-precondition',
      'Location suggestions are temporarily unavailable.'
    );
  }

  const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('types', 'poi,address,place,city,locality,neighborhood,street');
  url.searchParams.set('session_token', sessionToken);
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
      'Location suggestions are temporarily unavailable.'
    );
  }
  if (!response.ok) {
    throw new SocialDomainError(
      'unavailable',
      'Location suggestions are temporarily unavailable.'
    );
  }

  const body = await response.json() as {
    suggestions?: Array<{
      mapbox_id?: unknown;
      name?: unknown;
      name_preferred?: unknown;
      address?: unknown;
      place_formatted?: unknown;
      full_address?: unknown;
      feature_type?: unknown;
    }>;
  };
  const seen = new Set<string>();
  const suggestions: FriendEventLocationSuggestion[] = [];
  for (const suggestion of body.suggestions || []) {
    const id = featureText(suggestion.mapbox_id);
    const primaryText = featureText(suggestion.name_preferred) || featureText(suggestion.name);
    const featureType = featureText(suggestion.feature_type) || 'place';
    const fullAddress = featureText(suggestion.full_address)
      || [featureText(suggestion.address), featureText(suggestion.place_formatted)]
        .filter(Boolean)
        .join(', ')
      || [primaryText, featureText(suggestion.place_formatted)].filter(Boolean).join(', ');
    const secondaryText = featureType === 'poi'
      ? fullAddress
      : featureText(suggestion.place_formatted) || fullAddress;
    const dedupeKey = `${primaryText}|${fullAddress}`.toLocaleLowerCase();
    if (
      !id || !primaryText
      || !fullAddress
      || seen.has(dedupeKey)
    ) continue;
    seen.add(dedupeKey);
    suggestions.push({
      id: `mapbox:${id}`,
      mapboxId: id,
      primaryText,
      secondaryText,
      fullAddress,
      featureType,
    });
  }

  return { suggestions: suggestions.slice(0, 5) };
}

/**
 * Complete a Search Box session after the user deliberately selects a result.
 * These coordinates are only a client preview; create/update replaces them via
 * an independently licensed server geocode before anything is stored.
 */
export async function retrieveFriendEventLocationSuggestion(
  input: Record<string, unknown>,
  accessToken: string,
  options: { fetchImpl?: FetchLike } = {}
): Promise<ResolvedFriendEventLocationSuggestion> {
  const id = mapboxId(input.mapboxId);
  const sessionToken = searchSessionToken(input.sessionToken);
  const normalizedAccessToken = accessToken.trim();
  if (!normalizedAccessToken) {
    throw new SocialDomainError(
      'failed-precondition',
      'Location suggestions are temporarily unavailable.'
    );
  }

  const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}`);
  url.searchParams.set('session_token', sessionToken);
  url.searchParams.set('access_token', normalizedAccessToken);

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SocialDomainError('unavailable', 'That location could not be loaded right now.');
  }
  if (!response.ok) {
    throw new SocialDomainError('unavailable', 'That location could not be loaded right now.');
  }

  const body = await response.json() as {
    features?: Array<{
      geometry?: { coordinates?: unknown[] };
      properties?: {
        mapbox_id?: unknown;
        name?: unknown;
        name_preferred?: unknown;
        address?: unknown;
        place_formatted?: unknown;
        full_address?: unknown;
        feature_type?: unknown;
      };
    }>;
  };
  const feature = body.features?.[0];
  const properties = feature?.properties || {};
  const primaryText = featureText(properties.name_preferred) || featureText(properties.name);
  const fullAddress = featureText(properties.full_address)
    || [featureText(properties.address), featureText(properties.place_formatted)]
      .filter(Boolean)
      .join(', ')
    || primaryText;
  const latitude = finiteCoordinate(feature?.geometry?.coordinates?.[1], -90, 90);
  const longitude = finiteCoordinate(feature?.geometry?.coordinates?.[0], -180, 180);
  if (!primaryText || !fullAddress || latitude === null || longitude === null) {
    throw new SocialDomainError('invalid-argument', 'That location could not be resolved.');
  }
  return {
    mapboxId: featureText(properties.mapbox_id) || id,
    primaryText,
    fullAddress,
    featureType: featureText(properties.feature_type) || 'place',
    latitude,
    longitude,
  };
}

/**
 * Resolve a custom event address on the trusted server boundary. Coordinates
 * supplied by the app are treated as preview-only and replaced in production.
 * The address and returned coordinates are never logged here.
 */
export async function resolveFriendEventAddress(
  input: Record<string, unknown>,
  options: { fetchImpl?: FetchLike } = {}
): Promise<Record<string, unknown>> {
  const location = record(input.location);
  if (!location || location.type !== 'custom_address') return input;

  const address = addressText(location.address);
  if (address.length < 5) {
    throw new SocialDomainError('invalid-argument', 'Enter a complete event address.');
  }

  const url = new URL(
    process.env.NOMINATIM_API_ENDPOINT || 'https://nominatim.openstreetmap.org/search'
  );
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', address);
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ca');
  url.searchParams.set('addressdetails', '1');

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GathRPreview/1.1 (support@gathr.app)',
      },
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

  const body = await response.json() as Array<{
    lat?: unknown;
    lon?: unknown;
    name?: unknown;
    display_name?: unknown;
  }>;
  const match = body[0];
  const longitude = Number(match?.lon);
  const latitude = Number(match?.lat);
  const resolvedAddress = addressText(match?.display_name);
  const resolvedName = featureText(match?.name);
  const resolvedPlaceName = resolvedName && !/^\d+[a-z-]?$/i.test(resolvedName)
    ? resolvedName
    : '';
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    resolvedAddress.length < 5
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
      // Search Box fields supplied by the app are preview-only. Only the
      // independently resolved OpenStreetMap values cross the storage boundary.
      address: resolvedAddress,
      placeName: resolvedPlaceName,
      latitude,
      longitude,
    },
  };
}
