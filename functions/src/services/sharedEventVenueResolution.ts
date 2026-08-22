import { ParsedSharedEvent } from '../types/sharedEvent.js';
import * as firestoreService from './firestoreService.js';

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue !== 0) return numberValue;
  }
  return undefined;
}

function venueDisplayName(venue: Record<string, unknown>): string {
  return firstText(venue.pagename, venue.name, venue.title);
}

export async function resolveOrRequireSharedEventVenue(
  event: ParsedSharedEvent,
  findMatchingVenue = firestoreService.findMatchingVenue
): Promise<ParsedSharedEvent> {
  if (event.locationScope === 'route') return event;
  if (event.address || (
    Number.isFinite(event.latitude) &&
    Number.isFinite(event.longitude) &&
    event.latitude !== 0 &&
    event.longitude !== 0
  )) {
    return {
      ...event,
      venueResolutionStatus: 'not_needed',
    };
  }

  const locationName = firstText(event.locationName, event.visibilityEvidence.locationName);
  if (!locationName) return event;

  const match = await findMatchingVenue(locationName);
  if (match.isMatch && match.matchedVenue) {
    const venue = match.matchedVenue as unknown as Record<string, unknown>;
    const coordinates = venue.coordinates as Record<string, unknown> | undefined;
    const placeDetails = venue.placeDetailsParsed as Record<string, unknown> | undefined;
    const latitude = firstFiniteNumber(
      venue.latitude,
      venue.lat,
      coordinates?.latitude,
      coordinates?.lat
    );
    const longitude = firstFiniteNumber(
      venue.longitude,
      venue.lng,
      coordinates?.longitude,
      coordinates?.lng
    );
    const address = firstText(venue.address, placeDetails?.formatted_address);
    return {
      ...event,
      locationName: venueDisplayName(venue) || locationName,
      address: address || undefined,
      latitude,
      longitude,
      resolvedVenueId: firstText(venue.id) || undefined,
      locationScope: 'venue',
      locationPrecision: latitude !== undefined && longitude !== undefined ? 'exact' : event.locationPrecision,
      mapMode: 'venue',
      venueResolutionStatus: 'not_needed',
    };
  }

  const reviewReasons = Array.from(new Set([
    ...(event.reviewReasons || []),
    'venue_selection_required',
  ]));
  return {
    ...event,
    locationScope: event.locationScope || 'unknown',
    locationPrecision: event.locationPrecision || 'none',
    mapMode: 'none',
    venueResolutionStatus: 'selection_required',
    needsUserReview: true,
    status: event.isExpired ? 'expired' : 'needs_user_review',
    reviewReasons,
  };
}
