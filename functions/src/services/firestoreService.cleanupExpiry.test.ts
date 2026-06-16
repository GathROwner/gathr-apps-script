import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExpiredCityLevelReviewPointerUpdateForRegression,
  evaluateExpiredDeleteDecisionForRegression,
  evaluateExpiredImageCleanupTargetsForRegression,
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
