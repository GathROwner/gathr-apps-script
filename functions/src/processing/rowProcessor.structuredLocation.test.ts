import test from 'node:test';
import assert from 'node:assert/strict';
import * as firestore from '../services/firestoreService.js';
import * as posterReader from '../parsing/structuredPosterValidator.js';
import * as postParser from '../parsing/postParser.js';
import {processRow, previewFullParserEventWritePayload, buildStructuredFacebookEventScraperEvents, previewDuplicateMerge} from './rowProcessor.js';
import {validateStructuredLocation} from '../parsing/structuredLocationValidation.js';
import type {RawRowData, VenueData, ParseSnapshot, EventData} from '../types/index.js';
import type {ProcessedEvent} from '../parsing/types.js';
import {BatchManager, createBatchState} from './batchManager.js';
const venue: VenueData = {id: 'synthetic-hall', name: 'Irish Cultural Centre', normalizedName: 'irish cultural centre', address: '582 N River Rd, Charlottetown, PE', latitude: 46.2615, longitude: -63.1558};
const row = (overrides: Partial<RawRowData> = {}): RawRowData => ({uniqueId: 'synthetic-concert', sharedPostText: 'Community Concert',
  text: 'When: October 16 from 19:30-22:00 ADT\nLocation: Charlottetown, PEI', mediaUrls: ['https://example.test/poster.webp'],
  userName: 'Charlottetown, PEI', pageName: 'Community Organizer', facebookEventLocationName: 'Charlottetown, PEI', facebookEventLocationIsCityLevel: true,
  sourceScraperType: 'events', timestamp: '2026-10-16T22:30:00Z', utcStartDate: '2026-10-16T22:30:00Z', ...overrides});
const poster = {status: 'explicit_venue' as const, occurrence: 'matching' as const, venueText: 'Benevolent Irish Society', addressText: '', venueEvidence: 'Benevolent Irish Society', broadEvidence: '',
  startText: '7:30', endText: '10PM', doorsText: '6:30', clockEvidence: 'October 16 and 23\n7:30 - 10PM\nDOORS OPEN AT 6:30'};
const managed = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/synthetic.webp';

test('actual row shortcut feeds validated poster-only venue through resolver into publication preview', async context => {
  const snapshots: ParseSnapshot[] = [];
  context.mock.method(firestore, 'findCityLevelEventReviewByUniqueId', async () => null);
  context.mock.method(firestore, 'getAllVenues', async () => [venue]);
  context.mock.method(firestore, 'getVenue', async () => venue);
  context.mock.method(firestore, 'saveParseSnapshot', async (snapshot: ParseSnapshot) => {snapshots.push(snapshot);});
  context.mock.method(postParser, 'prepareManagedDisplayImageUrls', async () => [managed]);
  const reader = context.mock.method(posterReader, 'readStructuredPosterEvidence', async () => poster);
  const full = context.mock.method(postParser, 'parsePostData', async () => {throw new Error('Structured validation must not run all five stages');});
  const source = row();
  const manager = new BatchManager(createBatchState('synthetic-file', 'synthetic.xlsx', 1), {parserMode: 'full5stage', dryRun: true});
  const result = await processRow(source, 0, manager, {parserMode: 'full5stage', dryRun: true});
  assert.equal(result.success, true, result.error); assert.equal(reader.mock.calls.length, 1); assert.equal(full.mock.calls.length, 0);
  const output = snapshots.at(-1)?.stages.find(stage => stage.stage === 'format')?.output as {events: ProcessedEvent[]};
  assert.equal(output.events.length, 1);
  const item = output.events[0]; assert.equal(item.locationScope, 'venue'); assert.equal(item.startDate, '2026-10-16');
  const payload = await previewFullParserEventWritePayload(item, {...source, structuredLocationValidation: item.structuredLocationValidation}, 0, 0, venue, venue.name);
  assert.equal(payload.venueId, venue.id); assert.equal(payload.locationScope, 'venue'); assert.equal(payload.locationPrecision, 'exact');
  assert.equal(payload.address, venue.address); assert.equal(payload.startTime, '19:30'); assert.equal(payload.endTime, '22:00');
  assert.equal((payload.timeFlags as any).end.source, 'explicit'); assert.match(payload.description || '', /Doors open at 6:30 p\.m\./);
  assert.deepEqual(payload.sourceUniqueIds, [source.uniqueId]); assert.equal(payload.uniqueId, 'synthetic-concert_1');
});

test('actual protected review rows skip before poster calls for changed source content', async context => {
  let review: any;
  context.mock.method(firestore, 'findCityLevelEventReviewByUniqueId', async () => review);
  const reader = context.mock.method(posterReader, 'readStructuredPosterEvidence', async () => {throw new Error('Human/retired review must remain protected');});
  for (const state of [{status: 'rejected'}, {status: 'ignored'}, {status: 'published_as_venue_event', publishedEventPath: 'venues/synthetic-hall/events/keeper'},
    {status: 'published', finalization: {action: 'approve_publish', manual: {locationLabel: 'Reviewed location'}}}]) {
    review = state;
    const manager = new BatchManager(createBatchState('synthetic-file', 'synthetic.xlsx', 1), {parserMode: 'full5stage'});
    const result = await processRow(row({text: 'Changed caption'}), 0, manager, {parserMode: 'full5stage'});
    assert.equal(result.skipped, true); assert.equal(result.success, true);
  }
  assert.equal(reader.mock.calls.length, 0);
});

test('old automatically published city source revalidates but cannot silently migrate to a venue', async context => {
  context.mock.method(firestore, 'findCityLevelEventReviewByUniqueId', async () => ({status: 'published', resolvedBy: 'city_level_auto_publish', finalization: {action: 'approve_publish', manual: {}}}));
  context.mock.method(firestore, 'getAllVenues', async () => [venue]);
  const reader = context.mock.method(posterReader, 'readStructuredPosterEvidence', async () => poster);
  const queue = context.mock.method(firestore, 'queueCityLevelEventReview', async () => {throw new Error('Dry preview cannot write review');});
  const manager = new BatchManager(createBatchState('synthetic-file', 'synthetic.xlsx', 1), {parserMode: 'full5stage', dryRun: true});
  const result = await processRow(row(), 0, manager, {parserMode: 'full5stage', dryRun: true});
  assert.equal(result.success, true, result.error); assert.equal(result.skipped, true); assert.equal(reader.mock.calls.length, 1); assert.equal(queue.mock.calls.length, 0);
});

test('duplicate merge keeps new validation only for the exact same occurrence and source clock', () => {
  const source = row({mediaUrls: []}); const proof = validateStructuredLocation({row: source, venues: [venue], sourceSignature: 'synthetic-v1', poster});
  const existing: EventData = {uniqueId: 'synthetic-concert_1', establishment: venue.name, venueId: venue.id, eventType: 'event', eventName: 'Community Concert',
    startDate: '2026-10-16', startTime: '19:30', endDate: '2026-10-16', endTime: '22:00'};
  const incoming = {...existing, structuredLocationValidation: proof};
  assert.deepEqual(previewDuplicateMerge({existingEvent: existing, incomingEvent: incoming, venue}).updates.structuredLocationValidation, proof);
  assert.equal(previewDuplicateMerge({existingEvent: existing, incomingEvent: {...incoming, uniqueId: 'second-session_1', startTime: '21:00'}, venue}).updates.structuredLocationValidation, undefined);
});

test('a worker superseded during poster validation cannot write a review or snapshot', async context => {
  context.mock.method(firestore, 'findCityLevelEventReviewByUniqueId', async () => null);
  context.mock.method(firestore, 'getAllVenues', async () => [venue]);
  context.mock.method(posterReader, 'readStructuredPosterEvidence', async () => ({...poster, startText: '8:30 PM', clockEvidence: '8:30 PM - 10PM; DOORS OPEN AT 6:30'}));
  const queued = context.mock.method(firestore, 'queueCityLevelEventReview', async () => {throw new Error('Stale worker wrote review');});
  const snapshots = context.mock.method(firestore, 'saveParseSnapshot', async () => {throw new Error('Stale worker wrote snapshot');});
  const state = {...createBatchState('synthetic-file', 'synthetic.xlsx', 1), runId: 'synthetic-run'};
  const manager = new BatchManager(state, {parserMode: 'full5stage'}, 'synthetic-worker');
  const fence = context.mock.method(firestore, 'assertProcessingWorkerActive', async () => {throw new Error('resume_worker_fenced');});
  await assert.rejects(() => processRow(row(), 0, manager, {parserMode: 'full5stage'}), /resume_worker_fenced/);
  assert.equal(fence.mock.calls.length, 1); assert.equal(queued.mock.calls.length, 0); assert.equal(snapshots.mock.calls.length, 0);
  assert.deepEqual(fence.mock.calls[0].arguments, ['synthetic-file', 'synthetic-run', 'synthetic-worker']);
});
