import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtractedItem, FormattedEvent } from './types.js';
import { rehydrateFormattedEventMetadata } from './finalFormatter.js';

test('Stage 5 cannot discard Stage-3 route evidence', () => {
  const spatial = {
    kind: 'route',
    ordered: true,
    locations: [
      { label: 'Queen Charlotte Intermediate School', role: 'start', certainty: 'confirmed' },
      { label: 'Fitzroy Street', role: 'finish', certainty: 'confirmed' },
    ],
    confirmedStreets: ['North River Road', 'Brighton Road'],
    evidenceNotes: 'Organizer-listed street sequence.',
  };
  const original = { type: 'event', name: 'Gold Cup Parade', spatial } as unknown as ExtractedItem;
  const formatted = {
    name: 'Gold Cup Parade',
    description: 'Annual parade.',
  } as unknown as FormattedEvent;

  const result = rehydrateFormattedEventMetadata(formatted, original);

  assert.deepEqual(result.spatial, spatial);
  assert.notEqual(result.spatial, spatial, 'evidence should be cloned before later mutation');
});

test('aligned source spatial evidence outranks formatter guesses without mutating either input', () => {
  const formattedSpatial = {
    kind: 'multi_location',
    ordered: false,
    locations: [{ label: 'Victoria Row', role: 'location', certainty: 'confirmed' }],
  };
  const originalSpatial = {
    kind: 'route',
    ordered: true,
    locations: [{ label: 'Do not replace', role: 'start', certainty: 'confirmed' }],
  };
  const original = { type: 'event', name: 'Festival', spatial: originalSpatial } as unknown as ExtractedItem;
  const formatted = {
    name: 'Festival',
    spatial: formattedSpatial,
  } as unknown as FormattedEvent;

  const result = rehydrateFormattedEventMetadata(formatted, original);

  assert.deepEqual(result.spatial, originalSpatial);
  assert.notEqual(result.spatial, originalSpatial, 'source proof is cloned before later mutation');
  assert.equal(formatted.spatial, formattedSpatial, 'formatter input remains unchanged');
  assert.equal(original.spatial, originalSpatial, 'source input remains unchanged');
});
