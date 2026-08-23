import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSharedEventPushContent,
  isExpoPushToken,
  sharedEventPushInstallationId,
  shouldSendSharedEventPush,
} from './sharedEventPush.js';

test('accepts Expo push tokens and creates a stable non-secret document id', () => {
  const token = 'ExponentPushToken[abc_DEF-123]';
  assert.equal(isExpoPushToken(token), true);
  assert.equal(isExpoPushToken('not-a-push-token'), false);
  assert.equal(sharedEventPushInstallationId(token).length, 64);
  assert.equal(sharedEventPushInstallationId(token), sharedEventPushInstallationId(token));
  assert.equal(sharedEventPushInstallationId(token).includes('abc_DEF'), false);
});

test('notifies only when processing enters a terminal state', () => {
  assert.equal(shouldSendSharedEventPush('processing', 'completed'), true);
  assert.equal(shouldSendSharedEventPush('processing', 'failed'), true);
  assert.equal(shouldSendSharedEventPush('completed', 'completed'), false);
  assert.equal(shouldSendSharedEventPush('queued', 'processing'), false);
});

test('asks for venue selection before reporting ordinary completion', () => {
  assert.deepEqual(buildSharedEventPushContent('ingest-1', {
    processingStatus: 'completed',
    eventsPreview: [{
      locationName: 'Market Hall',
      venueResolutionStatus: 'selection_required',
    }],
  }), {
    title: 'Venue needed',
    body: 'Tap to choose the location for Market Hall.',
    kind: 'shared_event_venue_needed',
    ingestId: 'ingest-1',
  });
});

test('reports multiple events and failed scans clearly', () => {
  assert.equal(buildSharedEventPushContent('ingest-2', {
    processingStatus: 'completed',
    extractedEventCount: 2,
  }).body, 'GathR found 2 possible events from your share.');

  assert.deepEqual(buildSharedEventPushContent('ingest-3', {
    processingStatus: 'failed',
    processingError: 'OCR service unavailable',
  }), {
    title: 'Share needs a retry',
    body: 'OCR service unavailable',
    kind: 'shared_event_failed',
    ingestId: 'ingest-3',
  });
});

