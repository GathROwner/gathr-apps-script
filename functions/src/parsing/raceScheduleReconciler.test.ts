import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileRaceSchedule } from './raceScheduleReconciler.js';
import { ProcessedEvent } from './types.js';

const caption = `KIDS FOX TROT PRESENTED BY BOSTON PIZZA – RACE UPDATE!
The Kids Fox Trot is a FREE event for kids up to age 12 on Saturday, October 17th, 2026!
Location: Victoria Park
Friday, October 16th – Holman Grand Hotel Lobby
11:00 AM – 6:00 PM – Race Kit Pick-Up
Saturday, October 17th – Victoria Park Pavilion
10:00 – 10:45 AM – On-Site Registration & Race Kit Pick-Up
10:45 AM – Fun Warm-Up
11:00 AM – First Heat: Kids Ages 5 & Under
Immediately Following – Kids Ages 6–9
Immediately Following – Kids Ages 10–12
Register today: https://raceroster.com/events/2026/140645/2026-kids-fox-trot-presented-by-boston-pizza`;

function event(name: string, date: string, start: string, end: string): ProcessedEvent {
  return {
    name, startDate: date, endDate: date, startTime: start, endTime: end,
    description: '', category: 'Sports', establishment: date === '2026-10-16'
      ? 'Holman Grand Hotel Lobby' : 'Victoria Park',
    isEvent: 'Yes', isFoodSpecial: 'No', isRecurring: 'No', recurringPattern: 'none',
    ticketLink: '', ticketsBuyUrl: '', image: 'https://example.com/hero.webp',
    imageProvenance: { media: [
      { url: 'https://example.com/one.webp', source: 'post_media' },
      { url: 'https://example.com/two.webp', source: 'post_media' },
    ] },
    timeResolution: { hoursUsed: false, endFromHours: 'duration_default' },
    timeFlags: {
      start: { source: 'explicit', evidence: start },
      end: { source: 'semantic', evidence: 'duration default', toClose: false },
    },
  } as ProcessedEvent;
}

test('keeps Friday pickup, folds Saturday logistics, and restores race source details', () => {
  const input = [
    event('Kids Fox Trot Race Kit Pick-Up', '2026-10-16', '11:00', '18:00'),
    event('Kids Fox Trot On-Site Registration & Race Kit Pick-Up', '2026-10-17', '10:00', '10:45'),
    event('Kids Fox Trot Fun Warm-Up', '2026-10-17', '10:45', '12:45'),
    event('Kids Fox Trot First Heat — Ages 5 & Under', '2026-10-17', '11:00', '13:00'),
  ];
  const result = reconcileRaceSchedule(input, caption);
  assert.equal(result.applied, true);
  assert.equal(result.events.length, 2);
  assert.equal(result.foldedCount, 2);
  assert.equal(result.events[0].startDate, '2026-10-16');
  assert.equal(result.events[1].name, 'Kids Fox Trot Presented by Boston Pizza');
  assert.equal(result.events[1].startTime, '11:00');
  assert.equal(result.events[1].timeFlags?.end?.source, 'semantic');
  assert.match(result.events[1].description, /Kids Ages 10–12/);
  assert.match(result.events[1].ticketsBuyUrl || '', /raceroster\.com/);
  assert.equal(result.events[1].imageProvenance?.media?.length, 2);
});

test('corrects a race start mistaken for the warm-up and moves inferred end', () => {
  const input = [
    event('Kids Fox Trot Presented by Boston Pizza', '2026-10-17', '10:45', '12:45'),
    event('Kids Fox Trot Race Kit Pick-Up', '2026-10-16', '11:00', '18:00'),
  ];
  const result = reconcileRaceSchedule(input, caption);
  assert.equal(result.events.length, 2);
  assert.equal(result.correctedStart, true);
  assert.equal(result.events[0].startTime, '11:00');
  assert.equal(result.events[0].endTime, '13:00');
  assert.equal(result.events[0].timeFlags?.start?.source, 'explicit');
  assert.equal(result.events[0].timeFlags?.end?.source, 'semantic');
});

test('does not reinterpret another schedule or a race with mismatched date', () => {
  const unrelated = [event('Evening concert', '2026-10-17', '10:45', '12:45')];
  assert.equal(reconcileRaceSchedule(unrelated, caption).applied, false);
  const wrongDate = [event('Kids Fox Trot First Heat', '2026-10-18', '11:00', '13:00')];
  assert.equal(reconcileRaceSchedule(wrongDate, caption).applied, false);
});
