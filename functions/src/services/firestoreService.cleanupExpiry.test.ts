import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEventImageProvenanceForRegression,
  buildEventUpdatePayloadForRegression,
  buildExpiredCityLevelReviewPointerUpdateForRegression,
  evaluateExpiredDeleteDecisionForRegression,
  evaluateExpiredImageCleanupTargetsForRegression,
  sanitizeEventManagedImageReferencesForRegression,
} from './firestoreService.js';

const NOW_MS = Date.parse('2026-06-11T06:00:00.000Z'); // 3:00 AM Atlantic
const POLICY = {
  recurringGraceDays: 30,
  staleRecurringDays: 30,
};

function decisionFor(eventData: Record<string, unknown>) {
  return evaluateExpiredDeleteDecisionForRegression(eventData, '2026-06-10', NOW_MS, POLICY);
}

test('deletes a one-off event whose effective end date is before the cleanup cutoff', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'No',
      recurringPattern: 'none',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
    }),
    {
      shouldDelete: true,
      reason: 'deleted_non_recurring_ended',
    }
  );
});

test('deletes a one-off event whose cutoff-date local day has ended', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'No',
      recurringPattern: 'none',
      startDate: '2026-06-10',
      endDate: '2026-06-10',
    }),
    {
      shouldDelete: true,
      reason: 'deleted_non_recurring_ended',
    }
  );
});

test('deletes an overnight one-off on the cutoff date after its local end time passed', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'No',
      recurringPattern: 'none',
      startDate: '2026-06-10',
      startTime: '22:00',
      endDate: '2026-06-11',
      endTime: '01:00',
    }),
    {
      shouldDelete: true,
      reason: 'deleted_non_recurring_ended',
    }
  );
});

test('keeps an overnight one-off on the cutoff date while its local end time is still future', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'No',
      recurringPattern: 'none',
      startDate: '2026-06-10',
      startTime: '22:00',
      endDate: '2026-06-11',
      endTime: '04:00',
    }),
    {
      shouldDelete: false,
      reason: 'skipped_non_recurring_not_expired',
    }
  );
});

test('deletes a recurring series only after recurrence end plus grace period is before cutoff', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
      startDate: '2026-04-03',
      recurrenceUntilDate: '2026-05-01',
    }),
    {
      shouldDelete: true,
      reason: 'deleted_recurring_ended',
    }
  );

  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
      startDate: '2026-04-03',
      recurrenceUntilDate: '2026-06-01',
    }),
    {
      shouldDelete: false,
      reason: 'skipped_recurring_active',
    }
  );
});

test('routes stale open-ended recurring events to review instead of deleting them', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_monday',
      startDate: '2026-04-01',
      lastSeenAt: '2026-05-10T11:59:59.000Z',
    }),
    {
      shouldDelete: false,
      reason: 'review_recurring_stale_open_ended',
    }
  );
});

test('recognizes timestamp-like lastSeenAt values from other Firebase Admin instances', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_monday',
      startDate: '2026-04-01',
      lastSeenAt: {
        _seconds: Math.floor(Date.parse('2026-05-10T11:59:59.000Z') / 1000),
        _nanoseconds: 0,
        toDate() {
          return new Date('2026-05-10T11:59:59.000Z');
        },
      },
    }),
    {
      shouldDelete: false,
      reason: 'review_recurring_stale_open_ended',
    }
  );
});

test('routes ongoing-looking stale open-ended recurring events to review', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_thursday',
      startDate: '2026-05-07',
      lastSeenAt: '2026-05-09T12:45:06.350Z',
      description:
        'Great tunes every Thursday night 7-9pm at The Schooner Session, and every Sunday afternoon 2-4pm.',
    }),
    {
      shouldDelete: false,
      reason: 'review_recurring_stale_open_ended',
    }
  );
});

test('keeps open-ended recurring events recently seen inside the stale window', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_monday',
      startDate: '2026-04-01',
      lastSeenAt: '2026-05-20T12:00:00.000Z',
    }),
    {
      shouldDelete: false,
      reason: 'skipped_recurring_active',
    }
  );
});

test('keeps lifecycle-less recurring events without usable timestamps for manual review', () => {
  assert.deepEqual(
    decisionFor({
      isRecurring: 'Yes',
      recurringPattern: 'weekly_tuesday',
      startDate: '2026-04-01',
    }),
    {
      shouldDelete: false,
      reason: 'skipped_recurring_missing_lifecycle',
    }
  );
});

test('builds a review pointer update when top-level city event cleanup deletes a published event', () => {
  assert.deepEqual(
    buildExpiredCityLevelReviewPointerUpdateForRegression(
      'cityevt_986c6d92e6bbab073905f219',
      'events/cityevt_986c6d92e6bbab073905f219',
      {
        cityLevelReviewId: 'cityevt_986c6d92e6bbab073905f219',
        eventName: 'ATLANTIC 911 RIDE',
      }
    ),
    {
      reviewId: 'cityevt_986c6d92e6bbab073905f219',
      update: {
        status: 'approved',
        locationReviewStatus: 'approved',
        publishedEventId: 'deleteField',
        publishedEventPath: 'deleteField',
        expiredPublishedEventId: 'cityevt_986c6d92e6bbab073905f219',
        expiredPublishedEventPath: 'events/cityevt_986c6d92e6bbab073905f219',
        publishedEventExpiredAt: 'serverTimestamp',
        publishedEventExpiredBy: 'deleteExpiredEvents',
        publishedEventExpiredReason: 'expired_top_level_event_cleanup',
        updatedAt: 'serverTimestamp',
      },
    }
  );
});

test('skips review pointer updates for ordinary expired top-level events', () => {
  assert.equal(
    buildExpiredCityLevelReviewPointerUpdateForRegression(
      'ordinary_event',
      'events/ordinary_event',
      {
        eventName: 'Ordinary Event',
      }
    ),
    null
  );
});

test('selects only unreferenced expired event images when reference scan succeeds', () => {
  assert.deepEqual(
    evaluateExpiredImageCleanupTargetsForRegression(
      ['https://storage.googleapis.com/gathr-uploaded-images/postimages/a.webp', 'https://storage.googleapis.com/gathr-uploaded-images/postimages/b.webp'],
      ['https://storage.googleapis.com/gathr-uploaded-images/postimages/a.webp'],
      0
    ),
    {
      shouldSkipDeletion: false,
      unreferencedUrls: ['https://storage.googleapis.com/gathr-uploaded-images/postimages/b.webp'],
      skippedDueToReferenceQueryFailure: 0,
    }
  );
});

test('skips all expired event image deletion when reference scan has query failures', () => {
  assert.deepEqual(
    evaluateExpiredImageCleanupTargetsForRegression(
      [
        'https://storage.googleapis.com/gathr-uploaded-images/postimages/a.webp',
        'https://storage.googleapis.com/gathr-uploaded-images/postimages/a.webp',
        'https://storage.googleapis.com/gathr-uploaded-images/postimages/b.webp',
      ],
      [],
      1
    ),
    {
      shouldSkipDeletion: true,
      unreferencedUrls: [],
      skippedDueToReferenceQueryFailure: 2,
    }
  );
});

test('strips only confirmed-missing managed image references before event writes', () => {
  const missingPostImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/missing.webp?token=abc';
  const missingProfileImage = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/missing.webp';
  const livePostImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/live.webp';
  const fallbackImage = 'https://example.com/fallback.png';
  const original = {
    image: missingPostImage,
    imageUrl: livePostImage,
    relevantImageUrl: missingPostImage,
    icon: missingProfileImage,
    mediaUrls: [missingPostImage, livePostImage, fallbackImage],
  };

  const result = sanitizeEventManagedImageReferencesForRegression(original, [
    missingPostImage,
    missingProfileImage,
  ]);

  assert.equal(result.payload.image, undefined);
  assert.equal(result.payload.imageUrl, livePostImage);
  assert.equal(result.payload.relevantImageUrl, undefined);
  assert.equal(result.payload.icon, undefined);
  assert.deepEqual(result.payload.mediaUrls, [livePostImage, fallbackImage]);
  assert.deepEqual(result.removedFields, ['icon', 'image', 'mediaUrls', 'relevantImageUrl']);
  assert.deepEqual(result.removedUrls, [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/missing.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/missing.webp',
  ]);
  assert.deepEqual(original.mediaUrls, [missingPostImage, livePostImage, fallbackImage]);
});

test('omits all-missing managed media arrays instead of writing empty replacement arrays', () => {
  const missingPostImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/missing.webp';

  const result = sanitizeEventManagedImageReferencesForRegression(
    {
      image: missingPostImage,
      mediaUrls: [missingPostImage],
    },
    [missingPostImage]
  );

  assert.equal('image' in result.payload, false);
  assert.equal('mediaUrls' in result.payload, false);
  assert.deepEqual(result.removedFields, ['image', 'mediaUrls']);
});

test('also sanitizes managed image references nested in metadata', () => {
  const missingPostImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/missing.webp';
  const livePostImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/live.webp';

  const result = sanitizeEventManagedImageReferencesForRegression(
    {
      metadata: {
        imageUrl: missingPostImage,
        mediaUrls: [missingPostImage, livePostImage],
        source: 'parser',
      },
    },
    [missingPostImage]
  );

  assert.deepEqual(result.payload.metadata, {
    mediaUrls: [livePostImage],
    source: 'parser',
  });
  assert.deepEqual(result.removedFields, ['metadata.imageUrl', 'metadata.mediaUrls']);
});

test('builds image provenance from final event image fields', () => {
  const imageUrl = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/live.webp?token=abc';
  const iconUrl = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/profile.webp';

  const provenance = buildEventImageProvenanceForRegression(
    {
      image: imageUrl,
      imageUrl,
      relevantImageUrl: imageUrl,
      icon: iconUrl,
      mediaUrls: [imageUrl],
    },
    {
      defaultPrimarySource: 'post_media',
      defaultMediaSource: 'post_media',
      selectionReason: 'event_create_write',
      updatedBy: 'firestore_create',
    }
  );

  assert.equal(provenance.primarySource, 'post_media');
  assert.equal(provenance.primaryField, 'relevantImageUrl');
  assert.equal(
    provenance.primaryUrl,
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/live.webp'
  );
  assert.equal(provenance.setAt, 'serverTimestamp');
  assert.deepEqual(provenance.sourceFields, ['relevantImageUrl', 'image', 'imageUrl', 'icon', 'mediaUrls']);
  assert.ok(provenance.media?.some((entry) => entry.field === 'icon' && entry.source === 'profile_image'));
});

test('preserves parser supplied ticket-image provenance while rebuilding final refs', () => {
  const ticketImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/ticket.webp';
  const postImage = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/post.webp';

  const provenance = buildEventImageProvenanceForRegression(
    {
      image: ticketImage,
      relevantImageUrl: ticketImage,
      mediaUrls: [postImage],
      imageProvenance: {
        version: 1,
        primarySource: 'ticket_image',
        primaryField: 'relevantImageUrl',
        primaryUrl: ticketImage,
        isFallback: true,
        selectionReason: 'hero_image_fallback_for_unusable_source_media',
        media: [
          { url: ticketImage, source: 'ticket_image', field: 'relevantImageUrl', isPrimary: true },
          { url: postImage, source: 'post_media', field: 'mediaUrls' },
        ],
      },
    },
    {
      defaultPrimarySource: 'unknown',
      defaultMediaSource: 'unknown',
      selectionReason: 'event_update_write',
      updatedBy: 'firestore_update',
    }
  );

  assert.equal(provenance.primarySource, 'ticket_image');
  assert.equal(provenance.primaryUrl, ticketImage);
  assert.equal(provenance.isFallback, true);
  assert.ok(provenance.media?.some((entry) => entry.url === postImage && entry.source === 'post_media'));
});

test('preserves provenance-only event update payloads without rebuilding as no_image', () => {
  const image =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/under-spire.webp';
  const imageProvenance = {
    version: 1,
    primarySource: 'post_media',
    primaryField: 'relevantImageUrl',
    primaryUrl: image,
    isFallback: false,
    sourceFields: ['relevantImageUrl', 'image', 'mediaUrls'],
    media: [
      {
        url: image,
        source: 'post_media',
        field: 'relevantImageUrl',
        isPrimary: true,
        isFallback: false,
      },
    ],
    selectionReason: 'full_parser_event_media; duplicate_merge_image_update',
    updatedBy: 'duplicate_merge',
  };

  const payload = buildEventUpdatePayloadForRegression({
    imageProvenance,
  });

  assert.deepEqual(payload.imageProvenance, imageProvenance);
  assert.equal((payload.imageProvenance as any).primarySource, 'post_media');
  assert.equal((payload.imageProvenance as any).primaryUrl, image);
  assert.equal((payload.imageProvenance as any).updatedBy, 'duplicate_merge');
});
