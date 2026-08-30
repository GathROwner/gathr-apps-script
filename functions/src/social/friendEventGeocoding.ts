import { SocialDomainError } from './validation.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

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
