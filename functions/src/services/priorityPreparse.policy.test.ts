import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/priorityPreparse.json';
import {classifyReviewedOccurrenceConstraint, ReviewedOccurrenceConstraint} from './reviewedOccurrenceConstraints.js';
import {classifyReviewedOccurrenceRetirement} from './reviewedOccurrenceRetirement.js';
import {checkDuplicate} from './firestoreService.js';
import {isRetiredVenueReview, protectedStructuredReview} from './structuredLocationContract.js';
import type {EventData} from '../types/index.js';

// Proposed venue data only. These fixtures do not install any live policy.
for (const entry of fixture.policies) {
  test(`${entry.case} exact reviewed leaf is held by the actual selector before database access`, async () => {
    const venue = {id:entry.venueId, reviewedOccurrenceConstraints:[entry.rule as ReviewedOccurrenceConstraint]};
    const event = entry.event as EventData;
    const before = JSON.stringify({venue,event});
    assert.equal(classifyReviewedOccurrenceConstraint(event, venue), 'hold');
    assert.deepEqual(await checkDuplicate(event, venue.id, [], venue as any), {isDuplicate:true});
    assert.equal(JSON.stringify({venue,event}), before);
    for (const patch of [{uniqueId:'2222222222222222_other'}, {uniqueId:entry.rule.sourceUniqueId+'_unrelated',name:'Public Skate',eventName:'Public Skate'},
      {venueId:'another_venue'}]) {
      assert.equal(classifyReviewedOccurrenceConstraint({...event,...patch}, venue), 'none');
    }
  });
}

test('rink holds preserve other private/public/available slots and do not claim changed-leaf protection', () => {
  const entries = fixture.policies.filter(entry => entry.case === 'P02');
  const venue = {id:entries[0].venueId, reviewedOccurrenceConstraints:entries.map(entry => entry.rule as ReviewedOccurrenceConstraint)};
  for (const name of ['Public Skate','Available Ice','Minor Hockey','PRIVATE']) {
    assert.equal(classifyReviewedOccurrenceConstraint({...entries[0].event,uniqueId:'1680961583491226_different_slot',name,eventName:name} as EventData,venue),'none');
  }
});

test('farm retirement covers regenerated exact reviewed tuples while preserving roundup siblings and real venue', async () => {
  const entries = fixture.policies.filter(entry => entry.case === 'P05');
  const venue = {id:entries[0].venueId, reviewedOccurrenceConstraints:entries.map(entry => entry.rule as ReviewedOccurrenceConstraint)};
  for (const entry of entries) {
    const event = {...entry.event,uniqueId:'1719028883565264_regenerated'} as EventData;
    assert.equal(classifyReviewedOccurrenceConstraint(event,venue),'hold');
    assert.deepEqual(await checkDuplicate(event,venue.id,[],venue as any),{isDuplicate:true});
    for (const patch of [{startTime:'16:00'},{startDate:'2026-11-01'},
      {name:'Weekend Local Vendor Market',eventName:'Weekend Local Vendor Market'},
      {name:'Learn to Sketch',eventName:'Learn to Sketch'},
      {venueId:'4OcLMCRKRGoKO5eQncLi'},{uniqueId:'1133393029414650_keeper'}]) {
      assert.equal(classifyReviewedOccurrenceConstraint({...event,...patch},venue),'none');
    }
  }
});

test('concert root is outside numeric leaf retirement; canonical keeper and separate showtime must not be retired', () => {
  const root = fixture.rootRecovery.event as EventData;
  const venue = {id:root.venueId!,reviewedOccurrenceRetirements:{version:1 as const,kind:'reviewed_duplicate_cleanup' as const,
    reviewId:'p12-schema-boundary-fixture',canonicalEventPath:fixture.rootRecovery.canonicalEventPath,
    sourceUniqueIds:['995691343001179'],retiredUniqueIds:[root.uniqueId!]}};
  assert.deepEqual(classifyReviewedOccurrenceRetirement(root,venue),{kind:'none'});
  assert.equal(classifyReviewedOccurrenceConstraint(root,{id:venue.id}), 'none');
  // Do not use a source/date/name retired_occurrence rule here: the keeper has
  // that same tuple. No broad retirement is proposed in this candidate.
  for (const startTime of ['19:30','14:00']) {
    const event = {...root,uniqueId:'995691343001179_1',startTime};
    assert.equal(classifyReviewedOccurrenceConstraint(event,{id:venue.id}), 'none');
  }
  const retiredReview = {status:'published_as_venue_event',publishedEventPath:'events/cityrecovered_945857dde45256f91d627fb8'};
  assert.equal(isRetiredVenueReview(retiredReview),true);
  assert.equal(protectedStructuredReview(retiredReview as any),true);
});
