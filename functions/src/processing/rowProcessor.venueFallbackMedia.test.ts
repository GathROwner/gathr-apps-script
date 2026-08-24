import test from 'node:test';
import assert from 'node:assert/strict';

import { ProcessedEvent as ParserProcessedEvent } from '../parsing/types.js';
import { applyVenueMediaFallbacksToFullParserEventsForRegression } from './rowProcessor.js';

test('venue fallback media is attached only after parsing and does not overwrite post media', () => {
  const fallbackUrl = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/fallback.webp';
  const postUrl = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/post.webp';
  const events: ParserProcessedEvent[] = [
    {
      name: 'Seafood Chowder',
      startDate: '2026-07-26',
      startTime: '19:00',
      endDate: '2026-07-26',
      endTime: '22:00',
      category: 'Food Special',
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      recurringPattern: 'none',
    } as ParserProcessedEvent,
    {
      name: 'Chad & Perry',
      startDate: '2026-07-26',
      startTime: '16:00',
      endDate: '2026-07-26',
      endTime: '19:00',
      category: 'Live Music',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      recurringPattern: 'none',
      image: postUrl,
      relevantImageUrl: postUrl,
      mediaUrls: [postUrl],
    } as ParserProcessedEvent,
  ];

  const result = applyVenueMediaFallbacksToFullParserEventsForRegression(events, [fallbackUrl]);

  assert.equal(result[0].image, fallbackUrl);
  assert.equal(result[0].relevantImageUrl, fallbackUrl);
  assert.deepEqual(result[0].mediaUrls, [fallbackUrl]);
  assert.equal(result[0].imageProvenance?.primarySource, 'venue_media_fallback');
  assert.equal(result[0].imageProvenance?.isFallback, true);

  assert.equal(result[1].image, postUrl);
  assert.equal(result[1].relevantImageUrl, postUrl);
  assert.deepEqual(result[1].mediaUrls, [postUrl]);
  assert.equal(result[1].imageProvenance, undefined);
});
