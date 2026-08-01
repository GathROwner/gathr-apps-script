import test from 'node:test';
import assert from 'node:assert/strict';

import { alignFormattedEventsToValidatedDataForRegression } from './finalFormatter.js';
import { ExtractedItem, FormattedEvent } from './types.js';

function input(name: string, venue: string, startTime: string): ExtractedItem {
  return {
    name,
    description: `${venue}: ${name}`,
    date: '2026-08-01',
    startTime,
    endTime: '01:00',
    venue,
    recurringPattern: 'none',
  } as ExtractedItem;
}

function output(
  name: string,
  venue: string,
  startTime: string,
  sourceItemIndex?: number
): FormattedEvent {
  return {
    sourceItemIndex,
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Live Music',
    name,
    description: `${venue}: ${name}`,
    establishment: venue,
    address: '',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    startTime,
    endTime: '01:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue,
    additionalLocation: venue,
    isRecurring: 'No',
    recurringPattern: 'none',
  } as FormattedEvent;
}

test('sourceItemIndex preserves Downtown schedule venue identity when Stage 5 reorders rows', () => {
  const inputs = [
    input('Sunset Patio Party', 'Founders Food Hall', '16:00'),
    input('Rainbow Road Street Party', 'Kent Street', '16:00'),
    input('Dan Doiron', "Peake's Quay", '17:00'),
  ];
  const outputs = [
    output('Dan Doiron', "Peake's Quay", '17:00', 2),
    output('Sunset Patio Party', 'Founders Food Hall', '16:00', 0),
    output('Rainbow Road Street Party', 'Kent Street', '16:00', 1),
  ];

  const aligned = alignFormattedEventsToValidatedDataForRegression(outputs, inputs);

  assert.deepEqual(aligned.map((entry) => entry.event.name), [
    'Sunset Patio Party',
    'Rainbow Road Street Party',
    'Dan Doiron',
  ]);
  assert.deepEqual(aligned.map((entry) => entry.originalItem.venue), [
    'Founders Food Hall',
    'Kent Street',
    "Peake's Quay",
  ]);
});

test('guarded content matching aligns reordered legacy output that lacks sourceItemIndex', () => {
  const inputs = [
    input('DJ Fly', "Peake's Quay", '23:00'),
    input('DJ Viraaj', 'Charlottetown Beer Garden', '23:00'),
  ];
  const outputs = [
    output('DJ Viraaj', 'Charlottetown Beer Garden', '23:00'),
    output('DJ Fly', "Peake's Quay", '23:00'),
  ];

  const aligned = alignFormattedEventsToValidatedDataForRegression(outputs, inputs);

  assert.equal(aligned[0].event.name, 'DJ Fly');
  assert.equal(aligned[0].originalItem.venue, "Peake's Quay");
  assert.equal(aligned[1].event.name, 'DJ Viraaj');
  assert.equal(aligned[1].originalItem.venue, 'Charlottetown Beer Garden');
});

test('duplicate sourceItemIndex cannot repaint a different source row', () => {
  const inputs = [
    input('Gin & Tonic', "Hunter's Ale House", '23:00'),
    input('Follow the Rainbow', 'Kent Street', '23:00'),
  ];
  const outputs = [
    output('Gin & Tonic', "Hunter's Ale House", '23:00', 0),
    output('Gin & Tonic', 'City Cinema', '23:00', 0),
  ];

  const aligned = alignFormattedEventsToValidatedDataForRegression(outputs, inputs);

  assert.equal(aligned[0].event.venue, "Hunter's Ale House");
  assert.equal(aligned[1].event.name, 'Follow the Rainbow');
  assert.equal(aligned[1].event.venue, 'Kent Street');
});
