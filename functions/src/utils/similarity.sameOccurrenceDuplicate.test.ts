import test from 'node:test';
import assert from 'node:assert/strict';

import { isHighConfidenceSameOccurrenceDuplicate } from './similarity.js';

function occurrence(name: string, overrides: Record<string, string> = {}) {
  return {
    establishment: 'Albert & Crown Pub',
    additionalLocation: 'Albert & Crown Pub',
    startDate: '2026-08-01',
    startTime: '20:00',
    eventName: name,
    ...overrides,
  };
}

test('matches same-occurrence title variants with a contained distinctive core', () => {
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('MadJoy Live Music'),
      occurrence('MadJoy')
    ),
    true
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Mad Joy (Live Entertainment)'),
      occurrence('MadJoy')
    ),
    true
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Madgoy Live Show'),
      occurrence('MadJoy')
    ),
    true
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Lauren Flynn book signing (Wait for Me)'),
      occurrence('Lauren Flynn In-Person (Author Meet & Discuss)')
    ),
    true
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Emancipation Day Celebration (Music & Performances)'),
      occurrence('Emancipation Day 2026 (Black Cultural Society of PEI)')
    ),
    true
  );
});

test('does not merge across venues, dates, or times', () => {
  const candidate = occurrence('MadJoy Live Music');
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      candidate,
      occurrence('MadJoy', { additionalLocation: 'City Cinema' })
    ),
    false
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      candidate,
      occurrence('MadJoy', { startDate: '2026-08-02' })
    ),
    false
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      candidate,
      occurrence('MadJoy', { startTime: '22:00' })
    ),
    false
  );
});

test('does not merge records whose one shared word is not a contained event core', () => {
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Pressure'),
      occurrence('Pressure Cooker Showcase')
    ),
    false
  );
  assert.equal(
    isHighConfidenceSameOccurrenceDuplicate(
      occurrence('Summer Latin Festival'),
      occurrence('Summer Art Festival')
    ),
    false
  );
});
