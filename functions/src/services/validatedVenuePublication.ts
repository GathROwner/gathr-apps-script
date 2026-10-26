import type {EventData, VenueData} from '../types/index.js';

/** Shared fields for parser publication and explicitly reviewed recovery. This
 * is a payload validator, with no write, matching, dedupe or approval side effects. */
export function buildValidatedVenuePointFields(venue: VenueData, source: Partial<EventData>): Partial<EventData> & {venue: string} {
  const record = venue as VenueData & {pagename?: string};
  const name = String(venue.name || record.pagename || '').trim();
  const address = String(venue.address || '').trim();
  if (!venue.id || !name || !address) throw new Error('Venue publication requires canonical venue ID, name and address');
  const proof = source.structuredLocationValidation;
  if (proof && (proof.decision !== 'venue' || proof.venueId !== venue.id || proof.reasons.length)) {
    throw new Error('Structured location validation does not authorize this venue');
  }
  return {venueId: venue.id, establishment: name, venue: name, locationLabel: name,
    address, locationScope: 'venue', locationPrecision: 'exact', mapMode: 'venue', locationReviewStatus: 'not_needed',
    ...(source.timeFlags !== undefined ? {timeFlags: source.timeFlags} : {}),
    ...(source.timeResolution !== undefined ? {timeResolution: source.timeResolution} : {}),
    ...(proof ? {structuredLocationValidation: proof} : {})};
}

/** Recovery callers must supply reviewed, source-supported clocks. It preserves
 * the occurrence/source/media payload and cannot guess a missing clock flag. */
export function buildValidatedVenueRecoveryEvent(source: EventData, venue: VenueData): EventData {
  const flags = source.timeFlags as {start?: {source?: string; evidence?: string}; end?: {source?: string; evidence?: string}} | undefined;
  if (source.startTime && (flags?.start?.source !== 'explicit' || !flags.start.evidence)) throw new Error('Recovery start requires explicit source evidence');
  if (source.endTime && (flags?.end?.source !== 'explicit' || !flags.end.evidence)) throw new Error('Recovery end requires explicit source evidence');
  return {...source, ...buildValidatedVenuePointFields(venue, source)};
}
