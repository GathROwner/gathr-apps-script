import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseScheduleTextForRegression,
  shouldPreferAnchoredScheduleTextParserForRegression,
} from './eventExtractor.js';

test('anchored Downtown Charlottetown schedule text keeps performers attached to source venues', () => {
  const input = `What’s happening today in Downtown Charlottetown?

Sunday July 26, 2026 events:
2:00 pm - Peake’s Quay Sounds of the Water Front: Macaroon
2:00 pm - The Old Triangle: Sunday Sessions
5:00 pm - Peake’s Quay Sounds of the Water Front: Barry O’Brien
7:00 pm - City Cinema: Hadestown: The Musical
7:00 pm - Peake’s Quay: We 3
7:00 pm - Olde Dublin Pub: Gordon Belsher & Courtney Hogan - Chandler
9:00 pm - Hunter’s Ale House: Name That Tune

OCR TEXT:
May be an image of text.`;

  const items = parseScheduleTextForRegression(
    input,
    '2026-07-25',
    'Downtown Charlottetown Inc.',
    'schedule'
  );

  assert.equal(shouldPreferAnchoredScheduleTextParserForRegression(input, items), true);

  const we3 = items.find((item) => item.name === 'We 3');
  assert.equal(we3?.venue, 'Peake’s Quay');
  assert.equal(we3?.date, '2026-07-26');
  assert.equal(we3?.startTime, '19:00');

  const oldTriangle = items.find((item) => item.venue === 'The Old Triangle');
  assert.equal(oldTriangle?.name, 'Sunday Sessions');

  const hadestown = items.find((item) => item.name === 'Hadestown: The Musical');
  assert.equal(hadestown?.venue, 'City Cinema');
});

test('anchored schedule text strips decorative markers and keeps repeated names on their own date venues', () => {
  const input = `What is happening today in Downtown Charlottetown?

Monday July 27, 2026 events:
\u2744\uFE0F10:00 am - Havenwood Studio Theatre: Disney Frozen Jr.
12:00 pm - Founders Food Hall & Market Sound of the Waterfront: Dino and Judy

Tuesday, July 28, 2026 events:
5:00 pm - Peakes Quay Sounds of the Waterfront: Dino and Judy
\u2049\uFE0F8:30 pm - Church Hill Arms: Trivia`;

  const items = parseScheduleTextForRegression(
    input,
    '2026-07-27',
    'Downtown Charlottetown Inc.',
    'schedule'
  );

  assert.equal(shouldPreferAnchoredScheduleTextParserForRegression(input, items), true);

  const frozen = items.find((item) => item.name === 'Disney Frozen Jr.');
  assert.equal(frozen?.venue, 'Havenwood Studio Theatre');

  const mondayDino = items.find(
    (item) => item.name === 'Dino and Judy' && item.date === '2026-07-27'
  );
  assert.equal(mondayDino?.venue, 'Founders Food Hall & Market Sound of the Waterfront');

  const tuesdayDino = items.find(
    (item) => item.name === 'Dino and Judy' && item.date === '2026-07-28'
  );
  assert.equal(tuesdayDino?.venue, 'Peakes Quay Sounds of the Waterfront');

  const trivia = items.find((item) => item.name === 'Trivia');
  assert.equal(trivia?.venue, 'Church Hill Arms');
});

test('August 1 Downtown schedule regression keeps every performer on the venue named on its row', () => {
  const input = `What's happening today in Downtown Charlottetown?

Saturday August 1, 2026 events:
12:00 pm - Founders Food Hall & Market: Sunset Patio Party
1:00 pm - Kent Street Entertainment District: Rainbow Road
2:00 pm - Peake's Quay: Dan Doiron
3:00 pm - Olde Dublin Pub: Reed MacGregor
4:00 pm - City Cinema: Gail
5:00 pm - Sobeys Family Theatre: Anne
6:00 pm - Baba's Lounge: Room 140
7:00 pm - T's Kitchen: A Baddie Night
8:00 pm - Hunter's Ale House: Gin & Tonic
9:00 pm - Charlottetown Beer Garden: DJ Viraaj
10:00 pm - Peake's Quay: DJ Fly`;

  const items = parseScheduleTextForRegression(
    input,
    '2026-08-01',
    'Downtown Charlottetown Inc.',
    'schedule'
  );

  assert.equal(shouldPreferAnchoredScheduleTextParserForRegression(input, items), true);
  assert.equal(items.length, 11);

  const expectedPairs = [
    ['Sunset Patio Party', 'Founders Food Hall & Market'],
    ['Rainbow Road', 'Kent Street Entertainment District'],
    ['Dan Doiron', "Peake's Quay"],
    ['Reed MacGregor', 'Olde Dublin Pub'],
    ['Gail', 'City Cinema'],
    ['Anne', 'Sobeys Family Theatre'],
    ['Room 140', "Baba's Lounge"],
    ['A Baddie Night', "T's Kitchen"],
    ['Gin & Tonic', "Hunter's Ale House"],
    ['DJ Viraaj', 'Charlottetown Beer Garden'],
    ['DJ Fly', "Peake's Quay"],
  ];

  for (const [name, venue] of expectedPairs) {
    const item = items.find((candidate) => candidate.name === name);
    assert.equal(item?.venue, venue, `${name} should stay attached to ${venue}`);
    assert.equal(item?.date, '2026-08-01');
  }
});
