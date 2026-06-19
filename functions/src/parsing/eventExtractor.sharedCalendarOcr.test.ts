import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCalendarOcrTextForRegression } from './eventExtractor.js';

test('calendar OCR fallback extracts single flyer date line without explicit year', () => {
  const items = parseCalendarOcrTextForRegression(
    [
      'EST. 1994',
      'PEAKES',
      'QUAY',
      'RESTAURANT & BAR',
      'BROTHERS MACPHEE',
      'FRIDAY JUNE 19 | 7-10 PM',
    ].join('\n'),
    '2026-06-19',
    "Peake's Quay Restaurant & Bar"
  );

  assert.equal(items.length, 1);
  assert.deepEqual(
    {
      name: items[0].name,
      date: items[0].date,
      startTime: items[0].startTime,
      endTime: items[0].endTime,
      venue: items[0].venue,
      extractionReason: items[0].extractionReason,
    },
    {
      name: 'BROTHERS MACPHEE',
      date: '2026-06-19',
      startTime: '19:00',
      endTime: '22:00',
      venue: "Peake's Quay Restaurant & Bar",
      extractionReason: 'calendar_ocr_explicit_date_line',
    }
  );
});
