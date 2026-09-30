import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCaptionOnlyWeeklyEvents } from './captionOnlyWeekly.js';
import type { FormattedEvent } from './types.js';

function event(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes', isFoodSpecial: 'No', category: 'Workshops & Classes',
    name: 'BYOC (Bring Your Own Craft) nights', description: '',
    establishment: 'Frothy Coffee', address: '',
    startDate: '2026-10-01', endDate: '2026-10-01',
    startTime: '18:00', endTime: '20:00', ticketPrice: '', ticketLink: '',
    relevantImageIndex: -1, venue: 'Frothy Coffee', additionalLocation: '',
    isRecurring: false, recurringPattern: 'none',
    ...overrides,
  };
}

const caption = `Seawalk Studio has workshops October 4, October 25, November 8 and November 22, Sundays 1–4 PM.
Frothy Coffee is also hosting BYOC (Bring Your Own Craft) nights every Thursday from 6–8 PM!
OCR TEXT:
Every Friday at 7 PM is printed on an unrelated image.`;

test('preserves a separate caption-only weekly event beside dated flyer workshops', () => {
  const result = reconcileCaptionOnlyWeeklyEvents({
    combinedText: caption,
    postedAt: '2026-09-29T19:22:31.000Z', timezone: 'America/Halifax',
    events: [
      event({ name: 'Painted Pumpkins - Lise D Creations', startDate: '2026-10-04', relevantImageIndex: 0 }),
      event(),
    ],
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.promotedCount, 1);
  assert.equal(result.events[0].recurringPattern, 'none');
  assert.equal(result.events[1].recurringPattern, 'weekly_thursday');
  assert.equal(result.events[1].isRecurring, true);
  assert.equal(result.events[1].relevantImageIndex, -1);
});

test('holds when the scheduled caption item is missing or anchored to a different Thursday', () => {
  const base = { combinedText: caption, postedAt: '2026-09-29T19:22:31.000Z', timezone: 'America/Halifax' };
  const missing = reconcileCaptionOnlyWeeklyEvents({ ...base, events: [] });
  assert.deepEqual(missing.issues, ['missing_item']);
  const shifted = reconcileCaptionOnlyWeeklyEvents({ ...base, events: [event({ startDate: '2026-10-08' })] });
  assert.deepEqual(shifted.issues, ['anchor_mismatch']);
  assert.equal(shifted.events[0].recurringPattern, 'none');
});

test('does not promote image entries or cues found only in OCR text', () => {
  const result = reconcileCaptionOnlyWeeklyEvents({
    combinedText: 'Four dated workshops on Sundays 1–4 PM.\nOCR TEXT:\nBYOC every Thursday at 6 PM',
    postedAt: '2026-09-29T19:22:31.000Z', timezone: 'America/Halifax',
    events: [event({ relevantImageIndex: 0 })],
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.promotedCount, 0);
});

test('does not attach a generic caption-only title to a different weekly listing', () => {
  const result = reconcileCaptionOnlyWeeklyEvents({
    combinedText: caption,
    postedAt: '2026-09-29T19:22:31.000Z', timezone: 'America/Halifax',
    events: [event({ name: 'Craft' })],
  });
  assert.deepEqual(result.issues, ['missing_item']);
  assert.equal(result.events[0].recurringPattern, 'none');
});

test('uses next week when a same-day weekly start has already passed', () => {
  const result = reconcileCaptionOnlyWeeklyEvents({
    combinedText: 'BYOC (Bring Your Own Craft) nights every Thursday at 6 PM.',
    postedAt: '2026-10-01T23:30:00.000Z', timezone: 'America/Halifax',
    events: [event({ startDate: '2026-10-08' })],
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.events[0].recurringPattern, 'weekly_thursday');
});

test('recognizes a weekly caption time written with dotted p.m.', () => {
  const result = reconcileCaptionOnlyWeeklyEvents({
    combinedText: 'BYOC (Bring Your Own Craft) nights every Thursday from 6–8 p.m.\nOCR TEXT: workshops',
    postedAt: '2026-09-29T19:22:31.000Z', timezone: 'America/Halifax',
    events: [event()],
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.events[0].recurringPattern, 'weekly_thursday');
});
