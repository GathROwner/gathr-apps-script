import test from 'node:test';
import assert from 'node:assert/strict';
import type {RawRowData, VenueData} from '../types/index.js';
import {validateStructuredLocation, resolvePosterClocks, hasCurrentStructuredValidation, protectedStructuredReview, isRetiredVenueReview, structuredMediaSignature} from './structuredLocationValidation.js';
import type {StructuredPosterEvidence} from './structuredLocationValidation.js';

const venue: VenueData = {id: 'known-hall', name: 'Irish Cultural Centre', normalizedName: 'irish cultural centre', address: '582 N River Rd, Charlottetown, PE', latitude: 46.2, longitude: -63.1};
const row = (overrides: Partial<RawRowData> = {}): RawRowData => ({uniqueId: 'synthetic-source', sourceScraperType: 'events',
  sharedPostText: 'Community Concert', text: '', mediaUrls: [], userName: 'Charlottetown, PEI', pageName: 'City Organizer',
  facebookEventLocationName: 'Charlottetown, PEI', facebookEventLocationIsCityLevel: true,
  timestamp: '2026-10-16T22:30:00Z', utcStartDate: '2026-10-16T22:30:00Z', ...overrides});
const poster = (overrides: Partial<StructuredPosterEvidence> = {}): StructuredPosterEvidence => ({status: 'explicit_venue', occurrence: 'matching',
  venueText: 'Benevolent Irish Society', addressText: '', venueEvidence: 'Benevolent Irish Society', broadEvidence: '',
  startText: '7:30', endText: '10PM', doorsText: '6:30', clockEvidence: 'October 16 and 23\n7:30 - 10PM\nDOORS OPEN AT 6:30', ...overrides});
const validate = (source = row(), image: Parameters<typeof validateStructuredLocation>[0]['poster'] = 'no_media',
  extra: Partial<Parameters<typeof validateStructuredLocation>[0]> = {}) => validateStructuredLocation({row: source, sourceSignature: 'source-v1', venues: [venue], poster: image, ...extra});

test('title venue overrides a generic city via a reviewed exact alias', () => {
  const proof = validate(row({sharedPostText: 'Community Concert at the Benevolent Irish Society (BIS)'}));
  assert.equal(proof.decision, 'venue'); assert.equal(proof.venueId, venue.id);
});
test('full caption physical placement resolves; organizer/ticket outlet alone does not', () => {
  assert.equal(validate(row({text: 'Hosted at the Benevolent Irish Society (BIS), this performance tells a story.'})).decision, 'venue');
  const organizer = validate(row({text: 'Organized by Benevolent Irish Society. Tickets available at Irish Cultural Centre.'}));
  assert.equal(organizer.decision, 'broad'); assert.equal(organizer.venueId, undefined);
});
test('unresolved explicit venue holds rather than fuzzy-nearby matching', () => {
  const proof = validate(row({sharedPostText: 'Community Concert at Irish Cultural Center Annex'}));
  assert.equal(proof.decision, 'hold'); assert.ok(proof.reasons.includes('unresolved_explicit_venue'));
});
test('poster-only venue and shared printed meridiem validate one structured occurrence', () => {
  const proof = validate(row(), poster());
  assert.equal(proof.decision, 'venue'); assert.equal(proof.startTime, '19:30');
  assert.equal(proof.endTime, '22:00'); assert.equal(proof.doorsTime, '18:30');
  assert.equal(proof.timeFlags?.end.source, 'explicit'); assert.equal(proof.timeFlags?.end.evidence, poster().clockEvidence);
});

test('explicit description end must agree with a poster end before publication', () => {
  const conflict = validate(row(), poster(), {structuredEnd: {endDate: '2026-10-16', endTime: '21:00', source: 'descriptionRange'}});
  assert.equal(conflict.decision, 'hold');
  assert.ok(conflict.reasons.includes('structured_poster_end_conflict'));
  const matching = validate(row(), poster(), {structuredEnd: {endDate: '2026-10-16', endTime: '22:00', source: 'descriptionRange'}});
  assert.equal(matching.decision, 'venue');
});
test('structured admission start reconciles only with printed doors plus show', () => {
  const proof = validate(row({utcStartDate: '2026-10-16T21:30:00Z'}), poster());
  assert.equal(proof.decision, 'venue'); assert.equal(proof.startTime, '19:30');
});
test('19:00 is neither 18:30 doors nor 19:30 performance and stays held', () => {
  const proof = validate(row({utcStartDate: '2026-10-16T22:00:00Z'}), poster());
  assert.equal(proof.decision, 'hold'); assert.ok(proof.reasons.includes('structured_poster_start_conflict'));
});
test('second explicit end conflict holds, while inferred duration cannot overrule poster', () => {
  const explicit = validate(row(), poster(), {structuredEnd: {endTime: '21:00', endDate: '2026-10-16', source: 'dateTimeSentence'}});
  assert.ok(explicit.reasons.includes('structured_poster_end_conflict'));
  assert.equal(validate(row(), poster(), {structuredEnd: {endTime: '21:00', endDate: '2026-10-16', source: 'duration'}}).decision, 'venue');
});
test('doors-only evidence never invents performance start', () => {
  const proof = validate(row(), poster({startText: '', endText: '', doorsText: '6:30 PM', clockEvidence: 'Doors open at 6:30 PM'}));
  assert.equal(proof.decision, 'hold'); assert.ok(proof.reasons.includes('doors_without_showtime'));
});
test('bare unanchored meridiem remains unresolved', () => {
  assert.equal(resolvePosterClocks(poster({startText: '7:30', endText: '', doorsText: '', clockEvidence: '7:30'})).start, undefined);
  assert.equal(validate(row(), poster({startText: '7:30', endText: '', doorsText: '', clockEvidence: '7:30'})).decision, 'hold');
});
test('clock quotations and target occurrence are required', () => {
  assert.ok(validate(row(), poster({occurrence: 'not_printed'})).reasons.includes('unanchored_poster_clock'));
  assert.ok(validate(row(), poster({clockEvidence: 'Evening concert'})).reasons.includes('missing_clock_quotation'));
  assert.ok(validate(row(), poster({occurrence: 'conflict'})).reasons.includes('poster_occurrence_conflict'));
});
test('unavailable/unreadable/over-limit media never auto-publishes', () => {
  for (const image of ['unavailable', 'over_limit', poster({status: 'unreadable'})] as const) assert.equal(validate(row(), image).decision, 'hold');
});
test('no poster, no physical placement, no media and affirmative broad event remain distinct', () => {
  for (const image of ['no_media', poster({status: 'no_poster', venueText: '', addressText: '', startText: '', endText: '', doorsText: '', clockEvidence: ''}),
    poster({status: 'no_physical_venue', venueText: '', addressText: '', startText: '', endText: '', doorsText: '', clockEvidence: ''}),
    poster({status: 'broad_event', venueText: '', addressText: '', startText: '', endText: '', doorsText: '', clockEvidence: '', broadEvidence: 'Across Charlottetown'})] as const) {
    const proof = validate(row(), image); assert.equal(proof.decision, 'broad'); assert.equal(proof.posterStatus, typeof image === 'string' ? image : image.status);
  }
});
test('exact numbered address matches postal suffix; differing municipality or room does not', () => {
  assert.equal(validate(row({text: 'Location: 582 North River Road, P.O. Box 34, Charlottetown, PEI'})).venueId, venue.id);
  for (const text of ['Location: 582 North River Road, Summerside, PE', 'Location: 583 North River Road, Charlottetown, PE', 'Location: 582 North River Road, Room A, Charlottetown, PE']) {
    assert.equal(validate(row({text})).decision, 'hold');
  }
});
test('real route and multiple physical venues hold without arbitrary venue selection', () => {
  assert.equal(validate(row({sharedPostText: 'Community Parade', text: 'Start: Alpha Hall\nRoute: Main Street -> Water Street\nFinish: Beta Hall'})).decision, 'hold');
  assert.equal(validate(row({text: 'Locations: Alpha Hall; Beta Theatre'})).decision, 'hold');
});
test('old signatures do not prove validation; media identity and version are bound separately', () => {
  assert.equal(hasCurrentStructuredValidation({sourceSignature: 'source-v1'}, 'source-v1'), false);
  const proof = validate(); assert.equal(hasCurrentStructuredValidation(proof, 'source-v1', []), true);
  assert.equal(hasCurrentStructuredValidation(proof, 'changed', []), false);
  assert.equal(hasCurrentStructuredValidation(proof, 'source-v1', ['https://example.test/new.webp']), false);
  assert.equal(hasCurrentStructuredValidation({...proof, version: 0}, 'source-v1'), false);
});
test('human decisions and retired venue redirects protect both unchanged and changed sources', () => {
  for (const status of ['rejected', 'ignored', 'approved', 'published_as_venue_event']) assert.equal(protectedStructuredReview({status} as any), true);
  assert.equal(isRetiredVenueReview({publishedEventPath: 'venues/known-hall/events/keeper'}), true);
  assert.equal(protectedStructuredReview({status: 'published', resolvedLocationScope: 'venue'} as any), true);
  assert.equal(protectedStructuredReview({status: 'published', finalization: {action: 'approve_publish'}} as any), true);
  assert.equal(protectedStructuredReview({status: 'published'} as any), false);
  assert.equal(protectedStructuredReview({status: 'published', resolvedBy: 'city_level_auto_publish', finalization: {action: 'approve_publish', manual: {}}} as any), false);
});

test('media auth refresh reuses proof while changed crop, size, variant and GCS generation revalidate', () => {
  const fb = 'https://scontent.example.fbcdn.net/photo.jpg?stp=crop1&ctp=s960&cstp=mx827&oh=old&oe=old';
  assert.equal(structuredMediaSignature([fb]), structuredMediaSignature([fb.replace('oh=old&oe=old', 'oh=new&oe=new')]));
  for (const change of [fb.replace('crop1', 'crop2'), fb.replace('s960', 's640'), fb.replace('mx827', 'mx1242')]) assert.notEqual(structuredMediaSignature([fb]), structuredMediaSignature([change]));
  const gcs = 'https://storage.googleapis.com/images/poster.webp?generation=1&Signature=old&Expires=old';
  assert.equal(structuredMediaSignature([gcs]), structuredMediaSignature([gcs.replace('Signature=old&Expires=old', 'Signature=new&Expires=new')]));
  assert.notEqual(structuredMediaSignature([gcs]), structuredMediaSignature([gcs.replace('generation=1', 'generation=2')]));
});

test('source caption doors-only stays held even on an image-free row', () => {
  assert.ok(validate(row({text: 'Doors open at 6:30 PM'})).reasons.includes('doors_without_showtime'));
});
