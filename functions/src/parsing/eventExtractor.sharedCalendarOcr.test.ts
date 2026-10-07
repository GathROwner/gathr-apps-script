import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeCalendarItemsForRegression, parseCalendarOcrTextForRegression } from './eventExtractor.js';

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

test('ice-time date separator cannot create a ten-minute clock range or duplicate the primary slot', () => {
  const printed = [
    'Available Ice Times',
    'Saturday October 10-10:10am',
    'Sunday October 18- 10:10am, 1:50pm',
    'Tuesday October 20- 7:50pm',
    'Sunday October 25-1:50pm',
    'Tuesday Oct 27- 7:50pm',
  ].join('\n');
  const ocr = parseCalendarOcrTextForRegression(printed, '2026-10-07', 'Eastern Kings Sportsplex');
  assert.equal(ocr.length, 6);
  assert.ok(!ocr.some(item => item.startTime === '10:00' || item.endTime === '10:10'));

  const slots = [
    ['2026-10-10', '10:10 AM'],
    ['2026-10-18', '10:10 AM'],
    ['2026-10-18', '1:50 PM'],
    ['2026-10-20', '7:50 PM'],
    ['2026-10-25', '1:50 PM'],
    ['2026-10-27', '7:50 PM'],
  ];
  const primary = slots.map(([date, startTime]) => ({
    name: 'Available Ice Times', date, startTime,
  }));
  const merged = mergeCalendarItemsForRegression(primary as any, ocr);
  assert.equal(merged.length, 6);
});
