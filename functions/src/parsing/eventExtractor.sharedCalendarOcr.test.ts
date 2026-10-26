import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeCalendarItemsForRegression, parseCalendarOcrTextForRegression } from './eventExtractor.js';
import fixture from './__fixtures__/sourceAuditOct22.smallBatch.json';

test('reconstructed October22 poster OCR cannot publish its venue masthead beside Second Sundays',()=>{
  // This is an honest layout reconstruction, not the unavailable paid OCR text.
  const extra=parseCalendarOcrTextForRegression(fixture.cinema.reconstructedOcr,'2026-10-21','City Cinema');
  assert.deepEqual(extra,[]);
  const merged=mergeCalendarItemsForRegression([fixture.cinema.valid] as any,extra);
  assert.equal(merged.length,1);assert.match(merged[0].name,/Second Sundays/);
  assert.equal(merged[0].date,'2026-11-15');assert.equal(merged[0].startTime,'4:00 PM');
});

for(const layout of [
  'CITY CINEMA\nSunday November 15th | 4-6 PM',
  'November 2026\n15\nCITY CINEMA\n4 PM',
  'November 2026\n15\nCITY CINEMA\n4-6 PM',
  'A Different Poster\nCITY CINEMA\nSunday November 15th 4pm\n5pm',
])test('venue-only heading is rejected in OCR branch: '+layout.replace(/\n/g,' / '),()=>{
  assert.deepEqual(parseCalendarOcrTextForRegression(layout,'2026-10-21','City Cinema'),[]);
});

test('venue mentions and concurrent named events remain valid activities',()=>{
  for(const title of ['City Cinema Presents: Film Night','City Cinema | Film Night']){
    const items=parseCalendarOcrTextForRegression(title+'\nSunday November 15th 4pm','2026-10-21','City Cinema');
    assert.equal(items.length,1);assert.match(items[0].name,/Film Night/);
  }
  const primary=[{name:'Second Sundays',date:'2026-11-15',startTime:'16:00'},
    {name:'Independent Film Talk',date:'2026-11-15',startTime:'16:00'}] as any;
  assert.equal(mergeCalendarItemsForRegression(primary,[]).length,2);
});

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
