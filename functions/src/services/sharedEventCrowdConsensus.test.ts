import assert from 'node:assert/strict';
import test from 'node:test';
import { ParsedSharedEvent } from '../types/sharedEvent.js';
import {
  buildCrowdConsensus,
  buildCrowdContribution,
  crowdContributionMatchesAggregate,
  crowdStatusSummary,
  crowdTitleSimilarity,
  getCrowdEligibility,
  SHARED_EVENT_CROWD_THRESHOLD,
  SharedEventCrowdAggregateRecord,
} from './sharedEventCrowdConsensus.js';

function photoEvent(overrides: Partial<ParsedSharedEvent> = {}): ParsedSharedEvent {
  return {
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T12:00:00.000Z',
      reason: 'photo share',
    },
    routing: 'private_only',
    status: 'saved',
    title: 'Harbour Lights Concert',
    startDate: '2026-09-12',
    startTime: '19:00',
    locationName: 'Victoria Park Cultural Pavilion',
    mediaUrls: ['https://example.com/private-photo.jpg'],
    timezone: 'America/Halifax',
    confidence: 92,
    needsUserReview: false,
    reviewReasons: [],
    fieldSources: {
      title: 'uploaded_media',
      startDate: 'uploaded_media',
      startTime: 'uploaded_media',
      locationName: 'uploaded_media',
    },
    sourceContentSignature: 'photo-1',
    ...overrides,
  };
}

function contribution(ownerUid: string, overrides: Partial<ParsedSharedEvent> = {}) {
  return buildCrowdContribution({
    ownerUid,
    ingestId: `ingest-${ownerUid}`,
    privateEventId: `private-${ownerUid}`,
    event: photoEvent(overrides),
  });
}

test('only strong, current photo-derived event facts are crowd eligible', () => {
  assert.deepEqual(
    getCrowdEligibility(photoEvent(), { hasUserPhoto: true, nowIso: '2026-08-22T12:00:00-03:00' }),
    { eligible: true }
  );
  assert.equal(
    getCrowdEligibility(photoEvent({ title: 'Save the date' }), {
      hasUserPhoto: true,
      nowIso: '2026-08-22T12:00:00-03:00',
    }).reason,
    'title_not_specific'
  );
  assert.equal(
    getCrowdEligibility(photoEvent({ confidence: 79 }), {
      hasUserPhoto: true,
      nowIso: '2026-08-22T12:00:00-03:00',
    }).reason,
    'parser_confidence_too_low'
  );
  assert.equal(
    getCrowdEligibility(photoEvent({
      fieldSources: {
        title: 'share_payload',
        startDate: 'share_payload',
        locationName: 'share_payload',
      },
    }), {
      hasUserPhoto: true,
      nowIso: '2026-08-22T12:00:00-03:00',
    }).reason,
    'critical_facts_not_photo_derived'
  );
  assert.equal(
    getCrowdEligibility(photoEvent({ startDate: '2026-08-21' }), {
      hasUserPhoto: true,
      nowIso: '2026-08-22T12:00:00-03:00',
    }).reason,
    'date_out_of_range'
  );
});

test('minor OCR title differences match while different events do not', () => {
  assert.ok(crowdTitleSimilarity('Harbour Lights Concert', 'Harbor Lights Concert!') >= 0.74);
  assert.ok(crowdTitleSimilarity('Harbour Lights Concert', 'Community Pancake Breakfast') < 0.74);
});

test('one account can never satisfy the independent contributor threshold', () => {
  const rows = [
    contribution('same-user'),
    contribution('same-user', { confidence: 95 }),
    contribution('same-user', { confidence: 96 }),
  ];
  const consensus = buildCrowdConsensus(rows, SHARED_EVENT_CROWD_THRESHOLD);
  assert.equal(consensus.ready, false);
  assert.equal(consensus.reason, 'awaiting_independent_contributors');
});

test('three independent compatible submissions create consensus without exposing photos', () => {
  const rows = [
    contribution('user-1'),
    contribution('user-2', { title: 'Harbor Lights Concert', startTime: '19:00' }),
    contribution('user-3', { title: 'Harbour Lights Concert!', startTime: '19:15' }),
  ];
  const consensus = buildCrowdConsensus(rows);
  assert.equal(consensus.ready, true);
  assert.equal(consensus.fields?.startDate, '2026-09-12');
  assert.equal(consensus.fields?.locationName, 'Victoria Park Cultural Pavilion');
  assert.ok(consensus.fields?.startTime === '19:00' || consensus.fields?.startTime === '19:15');
  assert.equal('mediaUrls' in (consensus.fields || {}), false);
});

test('conflicting times and locations stay in separate aggregates', () => {
  const anchor = contribution('user-1');
  const aggregate = {
    title: anchor.title,
    startDate: anchor.startDate,
    locationName: anchor.locationName,
    timezone: anchor.timezone,
    titleKey: anchor.titleKey,
    locationKey: anchor.locationKey,
    dateLocationKey: anchor.dateLocationKey,
    contributorCount: 1,
    threshold: 3,
    contributions: [anchor],
    status: 'collecting',
    startTime: anchor.startTime,
  } as SharedEventCrowdAggregateRecord;

  assert.equal(
    crowdContributionMatchesAggregate(contribution('user-2', { startTime: '21:00' }), aggregate),
    false
  );
  assert.equal(
    crowdContributionMatchesAggregate(
      contribution('user-3', { locationName: 'Confederation Centre of the Arts' }),
      aggregate
    ),
    false
  );
});

test('crowd progress summaries distinguish collecting, review, and global outcomes', () => {
  const base = {
    privateEventId: 'private-1',
    contributorCount: 3,
    threshold: 3,
  } as const;
  const summary = crowdStatusSummary([
    { ...base, status: 'collecting', contributorCount: 2 },
    { ...base, privateEventId: 'private-2', status: 'needs_review' },
    { ...base, privateEventId: 'private-3', status: 'promoted' },
  ]);

  assert.equal(summary.collectingEventCount, 1);
  assert.equal(summary.reviewEventCount, 1);
  assert.equal(summary.promotedEventCount, 1);
  assert.equal(summary.maxContributorCount, 3);
});
