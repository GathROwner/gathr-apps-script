import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeCalendarItemsForRegression,
  parseCalendarOcrTextForRegression,
} from './eventExtractor.js';

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

test('calendar OCR supplement collapses decorated price variants of the same listing', () => {
  const items = mergeCalendarItemsForRegression(
    [{
      name: 'Makers Market',
      type: 'event',
      date: '2026-09-05',
      startTime: '09:00',
      endTime: '13:00',
      venue: 'Harbourlight Community Hall',
      address: '9 Dale Drive, Charlottetown, PE C1A 7V7',
      price: 'Free',
      description: 'Extracted from shared calendar image.',
      extractionReason: 'calendar_gpt',
    }],
    [{
      name: '• • MAKERS MARKET • FREE',
      type: 'event',
      date: '2026-09-05',
      startTime: '09:00',
      venue: '',
      description: 'OCR fallback listing.',
      extractionReason: 'calendar_ocr_explicit_date_line',
    }]
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Makers Market');
  assert.equal(items[0].venue, 'Harbourlight Community Hall');
  assert.equal(items[0].address, '9 Dale Drive, Charlottetown, PE C1A 7V7');
  assert.match(items[0].extractionReason || '', /calendar_ocr_explicit_date_line/);
});

test('calendar OCR supplement keeps distinct events sharing a date and time', () => {
  const items = mergeCalendarItemsForRegression(
    [{
      name: 'Makers Market',
      type: 'event',
      date: '2026-09-05',
      startTime: '09:00',
      venue: 'Harbourlight Community Hall',
      extractionReason: 'calendar_gpt',
    }],
    [{
      name: 'Kids Watercolour Workshop',
      type: 'event',
      date: '2026-09-05',
      startTime: '09:00',
      venue: 'Studio B',
      extractionReason: 'calendar_ocr_explicit_date_line',
    }]
  );

  assert.equal(items.length, 2);
});
