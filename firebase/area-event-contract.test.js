'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAreaData } = require('./area-event-contract');

test('accepts unordered verified festival locations', () => {
  const areaData = {
    version: 1,
    status: 'verified',
    locations: [
      {
        id: 'victoria-row',
        label: 'Victoria Row',
        certainty: 'confirmed',
        coordinates: { latitude: 46.234294, longitude: -63.125907 },
      },
      {
        id: 'founders-food-hall',
        label: 'Founders Food Hall & Market',
        certainty: 'confirmed',
        coordinates: { latitude: 46.2337506, longitude: -63.1205401 },
      },
    ],
  };
  assert.equal(validateAreaData(areaData), areaData);
});

test('rejects a fabricated connection between area locations', () => {
  assert.throws(
    () =>
      validateAreaData({
        version: 1,
        status: 'verified',
        locations: [
          {
            id: 'one',
            label: 'One',
            certainty: 'confirmed',
            coordinates: { latitude: 46.2, longitude: -63.1 },
          },
        ],
        orderedLocations: true,
      }),
    /cannot imply an ordered route/
  );
});

test('rejects invalid or duplicate location records', () => {
  assert.throws(
    () =>
      validateAreaData({
        version: 1,
        status: 'partial',
        locations: [
          {
            id: 'same',
            label: 'One',
            certainty: 'confirmed',
            coordinates: { latitude: 91, longitude: -63.1 },
          },
          {
            id: 'same',
            label: 'Two',
            certainty: 'guess',
            coordinates: { latitude: 46.2, longitude: -63.1 },
          },
        ],
      }),
    /coordinates are invalid.*duplicated.*certainty is invalid/
  );
});
