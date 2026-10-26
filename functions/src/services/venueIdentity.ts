import type { RawRowData, VenueData } from '../types/index.js';
import { extractFacebookSlug, normalizeUrl, normalizeVenueName } from '../utils/similarity.js';

const ROOM = /\b(?:board\s*room|meeting\s+room|room|rink|gymnasium|gym|auditorium|patio|courtyard|stage|upstairs|downstairs|basement)\b/i;
const GENERIC = new Set(['the', 'and', 'centre', 'center', 'community', 'sports', 'sport',
  'room', 'board', 'boardroom', 'meeting', 'rink', 'gym', 'gymnasium', 'auditorium',
  'patio', 'courtyard', 'stage', 'main', 'upstairs', 'downstairs', 'basement',
  'ice', 'surface', 'upper', 'lower', 'level', 'floor']);

function venueNames(venue: VenueData): string[] {
  return [venue.name, venue.pagename, ...(venue.aliases || [])]
    .map(value => normalizeVenueName(String(value || ''))).filter(Boolean);
}

export function sourcePageIdentifiesVenue(row: RawRowData, venue: VenueData): boolean {
  const source = String(row.facebookUrl || '').trim();
  const record = venue as VenueData & { pageurl?: string };
  if (!source) return false;
  return [venue.facebookUrl, record.pageurl].filter(Boolean).some(value => {
    const candidate = String(value);
    const sourceSlug = extractFacebookSlug(source);
    const candidateSlug = extractFacebookSlug(candidate);
    return normalizeUrl(source) === normalizeUrl(candidate) || Boolean(
      sourceSlug && candidateSlug && sourceSlug === candidateSlug
    );
  });
}

function civicKey(value: unknown): string {
  const raw = String(value || '').trim();
  return /^\d+[A-Za-z]?\s/.test(raw) ? normalizeVenueName(raw).replace(/ canada$/, '') : '';
}

/** This is corroboration for a parent identity, never a fuzzy venue match. */
export function resolveSourceVenueSubLocation(params: {
  candidate: string;
  row: RawRowData;
  venue: VenueData;
  eventAddress?: unknown;
}): { supported: boolean; reason: string } {
  const { candidate, row, venue } = params;
  const golfRoot=(value:string)=>normalizeVenueName(value).match(/^(.{3,}) golf (?:club|course)$/)?.[1]||'';
  const golfVariant=Boolean(golfRoot(candidate)&&venueNames(venue).some(name=>golfRoot(name)===golfRoot(candidate)));
  if (!ROOM.test(candidate)&&!golfVariant) return { supported: false, reason: 'not_sub_location' };
  if (/\b(?:moved|relocated|new venue|no longer|instead of)\b/i.test([row.text, row.sharedPostText].filter(Boolean).join('\n'))) {
    return { supported: false, reason: 'relocation_requires_verified_match' };
  }
  const address = civicKey(params.eventAddress);
  const parentAddress = civicKey(venue.address);
  if (address && parentAddress && address !== parentAddress) {
    return { supported: false, reason: 'conflicting_event_address' };
  }
  const corroborated = sourcePageIdentifiesVenue(row, venue) || Boolean(
    address && parentAddress && address === parentAddress
  );
  if (!corroborated) return { supported: false, reason: 'no_parent_identity_evidence' };
  // Club/course wording alone is insufficient. Require the exact owner page;
  // independent exact venue matches still win in the caller.
  if(golfVariant&&sourcePageIdentifiesVenue(row,venue))return{supported:true,reason:'verified_source_golf_name_variant'};

  const observed = normalizeVenueName(candidate);
  const names = venueNames(venue);
  if (names.includes(observed)) return { supported: true, reason: 'verified_source_venue_alias' };

  const observedTokens = new Set(observed.split(' '));
  // Require all distinctive parent tokens. APM is meaningful despite having
  // only three letters; a shared generic word such as "Centre" is not.
  const cityTokens = new Set(normalizeVenueName(String(venue.city || '')).split(' '));
  const anchored = [venue.name, venue.pagename].filter(Boolean).some(value => {
    const tokens = normalizeVenueName(String(value)).split(' ')
      .filter(token => token.length >= 2 && !GENERIC.has(token));
    const parentTokens = new Set(normalizeVenueName(String(value)).split(' '));
    return tokens.length > 0 && tokens.every(token => observedTokens.has(token)) &&
      [...observedTokens].every(token => parentTokens.has(token) || GENERIC.has(token) ||
        cityTokens.has(token) || /^[a-z]$|^\d+$/.test(token));
  });
  return { supported: anchored, reason: anchored ? 'source_venue_parent_and_room' : 'parent_name_not_supported' };
}

/** Only venue discovery uses this. Road geometry remains valid for area/route events. */
export function namedVenueCandidateIsCompatible(input: {
  observedName: string;
  candidateTypes?: readonly string[];
}): boolean {
  const types = new Set((input.candidateTypes || []).map(value => value.toLowerCase()));
  const geographicOnly = ['route', 'street_address', 'intersection', 'locality', 'postal_code',
    'administrative_area_level_1', 'administrative_area_level_2'].some(type => types.has(type));
  const place = ['park', 'establishment', 'event_venue', 'museum',
    'stadium', 'library', 'community_center', 'school', 'secondary_school', 'primary_school'].some(type => types.has(type));
  const namedPlace = /\b(?:park|centre|center|rink|arena|hall|museum|theatre|theater|library|club|church|school)\b/i
    .test(input.observedName);
  return !(namedPlace && geographicOnly && !place);
}
