import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { resolveFacebookEventEndDateTime, buildStructuredFacebookEventScraperEvents } from './rowProcessor.js';
import type { RawRowData } from '../types/index.js';
import fixture from './fixtures/chess-description-source.json';

const local = { date: '2026-10-25', time: '12:45' };
function row(description: string, start = local, utcStartDate?: string): RawRowData {
  return { uniqueId: 'description-control', sourceScraperType: 'events', text: `Description:\n${description}`,
    facebookEventDescription: description, utcStartDate: utcStartDate ||
      DateTime.fromISO(`${start.date}T${start.time}`, { zone: 'America/Halifax' }).toUTC().toISO()! } as RawRowData;
}

test('unmodified retained chess source resolves the event end, not doors or registration deadline', () => {
  const result = resolveFacebookEventEndDateTime({ text: fixture.inputText,
    utcStartDate: fixture.utcStartDate } as RawRowData, local);
  assert.equal(result?.endDate, '2026-10-25');
  assert.equal(result?.endTime, '16:00');
  assert.equal(result?.source, 'descriptionRange');
  assert.match(result!.evidence, /Sunday October 25 from 12:45-4 pm/);
});

test('structured adapter publishes explicit end provenance from retained source without a model or media fetch', async () => {
  const events = await buildStructuredFacebookEventScraperEvents({
    uniqueId: fixture.sourceId, text: fixture.inputText, sourceScraperType: 'events',
    sharedPostText: 'Scholastic Chess Tournament', utcStartDate: fixture.utcStartDate,
    userName: 'Birchwood Intermediate School', facebookEventLocationIsCityLevel: false,
  } as RawRowData, 'Birchwood Intermediate School', [], null, { managedMediaUrls: [fixture.managedImage] });
  assert.equal(events?.length, 1);
  assert.equal(events![0].startTime, '12:45');
  assert.equal(events![0].endTime, '16:00');
  assert.equal(events![0].timeFlags?.end?.source, 'explicit');
  assert.equal(events![0].timeResolution?.endFromFacebookEvent, 'descriptionRange');
});

for (const [name, description] of [
  ['different date', 'October 24 from 12:45-4 pm'],
  ['different year', 'October 25, 2027 from 12:45-4 pm'],
  ['different year without comma', 'October 25 2027 from 12:45-4 pm'],
  ['conflicting weekday', 'Monday October 25 from 12:45-4 pm'],
  ['rescheduled date', 'October 25 event rescheduled to October 26 from 12:45-4 pm'],
  ['multiple printed dates', 'October 25 and October 26 from 12:45-4 pm'],
  ['conflicting numeric date', 'October 25, 2026-10-26 from 12:45-4 pm'],
  ['different start', 'October 25 from 1-4 pm'],
  ['doors range', 'October 25 doors open from 12:45-4 pm'],
  ['registration range', 'October 25 registration from 12:45-4 pm'],
  ['registration header', 'Registration:\nOctober 25 from 12:45-4 pm'],
  ['registration header with blank line', 'Registration:\n\nOctober 25 from 12:45-4 pm'],
  ['submission deadline header', 'Submission deadline:\nOctober 25 from 12:45-4 pm'],
  ['check-in range', 'October 25 check-in from 12:45-4 pm'],
  ['deadline range', 'October 25 deadline from 12:45-4 pm'],
  ['clocks without range', 'October 25. Doors open 12:30 pm. Register by 6 pm on October 24.'],
  ['missing date', 'The tournament runs from 12:45-4 pm.'],
  ['missing end period', 'October 25 from 12:45-4'],
  ['ambiguous unmarked end', 'October 25 from 12:45-4:00'],
  ['multiple ranges', 'October 25 from 12:45-4 pm, then from 5-6 pm.'],
  ['repeated ranges', 'October 25 from 12:45-4 pm. October 25 from 12:45-4 pm.'],
  ['invalid minute', 'October 25 from 12:45-4:69 pm'],
  ['invalid hour', 'October 25 from 12:45-25 pm'],
  ['conflicting timezone', 'October 25 from 12:45-4 pm AST'],
  ['foreign timezone', 'October 25 from 12:45-4 pm EDT'],
  ['unrecognized foreign timezone', 'October 25 from 12:45-4 pm PDT'],
  ['foreign timezone after dotted period', 'October 25 from 12:45-4 p.m. PDT'],
  ['parenthesized foreign timezone', 'October 25 from 12:45-4 pm (PDT)'],
  ['long foreign timezone', 'October 25 from 12:45-4 pm Pacific Daylight Time'],
  ['foreign timezone after connector', 'October 25 from 12:45-4 pm in PDT'],
  ['lowercase foreign timezone', 'October 25 from 12:45-4 pm pdt'],
  ['short foreign timezone PT', 'October 25 from 12:45-4 pm PT'],
  ['short foreign timezone ET', 'October 25 from 12:45-4 pm ET'],
] as const) test(`description fallback holds: ${name}`, () => {
  assert.equal(resolveFacebookEventEndDateTime(row(description), local), null);
});

test('explicit 24-hour end and matching ADT end are supported', () => {
  for (const description of ['October 25 from 12:45-16:00', 'October 25 from 12:45-4 pm ADT',
    'October 25 from 12:45-4 p.m. ADT', 'October 25 from 12:45-4 pm (ADT)'])
    assert.equal(resolveFacebookEventEndDateTime(row(description), local)?.endTime, '16:00');
});

test('AST after the DST transition anchors an omitted start period to the structured clock', () => {
  const start = { date: '2026-11-02', time: '19:00' };
  assert.equal(resolveFacebookEventEndDateTime(row('November 2 from 7-9 pm AST', start), start)?.endTime, '21:00');
  assert.equal(resolveFacebookEventEndDateTime(row('November 2 from 7-9 pm ADT', start), start), null);
});

test('UTC midnight crossing uses the local event date', () => {
  const start = { date: '2026-10-24', time: '21:30' }, utc = '2026-10-25T00:30:00.000Z';
  const result = resolveFacebookEventEndDateTime(row('October 24 from 9:30-11 pm', start, utc), start);
  assert.equal(result?.endDate, '2026-10-24');
  assert.equal(result?.endTime, '23:00');
  assert.equal(resolveFacebookEventEndDateTime(row('October 25 from 9:30-11 pm', start, utc), start), null);
});

test('structured UTC disagreement, nonexistent spring time and ambiguous fall time hold', () => {
  assert.equal(resolveFacebookEventEndDateTime(row('October 25 from 12:45-4 pm', local, '2026-10-25T16:45:00.000Z'), local), null);
  const spring = { date: '2026-03-08', time: '02:30' };
  assert.equal(resolveFacebookEventEndDateTime(row('March 8 from 2:30-4 am', spring), spring), null);
  const fall = { date: '2026-11-01', time: '01:30' };
  assert.equal(resolveFacebookEventEndDateTime(row('November 1 from 1:30-2:30 am', fall, '2026-11-01T04:30:00.000Z'), fall), null);
});

test('description fallback does not infer an overnight date', () => {
  const start = { date: '2026-10-25', time: '23:00' };
  assert.equal(resolveFacebookEventEndDateTime(row('October 25 from 11 pm-1 am', start), start), null);
});

test('existing When and Duration handling take precedence unchanged', () => {
  const when = row('October 24 from 12:45-6 pm');
  when.text = 'When: October 25 at 12:45 PM - October 25 at 4 PM ADT\n' + when.text;
  assert.equal(resolveFacebookEventEndDateTime(when, local)?.source, 'dateTimeSentence');
  assert.equal(resolveFacebookEventEndDateTime(when, local)?.endTime, '16:00');
  const duration = row('October 24 from 12:45-6 pm');
  duration.text = 'Duration: 2 hours\n' + duration.text;
  assert.equal(resolveFacebookEventEndDateTime(duration, local)?.source, 'duration');
  assert.equal(resolveFacebookEventEndDateTime(duration, local)?.endTime, '14:45');
});
