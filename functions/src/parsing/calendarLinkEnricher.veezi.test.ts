import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFeedUrlsForRegression, mergeCalendarFeedItemsForRegression,
  mergeWebsiteDetailsIntoFlyerForRegression, parseDrupalFeedItemsForRegression,
  parseVeeziMonthItems } from './calendarLinkEnricher.js';

test('linked cinema month keeps each printed showtime, including two on one day', () => {
  const html = `
    <div class="veezi-cell"><div class="veezi-date">Oct 3</div>
      <div class="veezi-item"><div class="veezi-time">2:00 PM</div>
        <div class="veezi-film"><a href="/movies/?film=al-tuck">Al Tuck My Blues Away</a></div></div>
      <div class="veezi-item"><div class="veezi-time">7:00 PM</div>
        <div class="veezi-film"><a href="/movies/?film=al-tuck">Al Tuck My Blues Away</a></div></div></div>
    <div class="veezi-cell"><div class="veezi-date">Oct 4</div>
      <div class="veezi-item"><div class="veezi-time">7:00 PM</div>
        <div class="veezi-film"><a href="/movies/?film=al-tuck">Al Tuck My Blues Away</a></div></div></div>
  `;
  const items = parseVeeziMonthItems(
    html, '2026-10', 'https://citycinema.ca/calendar/?month=2026-10', 'City Cinema'
  );
  assert.deepEqual(items.map((item) => [item.name, item.date, item.startTime]), [
    ['Al Tuck My Blues Away', '2026-10-03', '14:00'],
    ['Al Tuck My Blues Away', '2026-10-03', '19:00'],
    ['Al Tuck My Blues Away', '2026-10-04', '19:00'],
  ]);
  assert.equal((items[0] as any).ticketLink, 'https://citycinema.ca/movies/?film=al-tuck');
  assert.ok(items.every((item) => item.relevantImageIndex === -1));
});

test('linked library feed item does not claim one of the source post flyers', () => {
  const html = `<article class="event-card"><a class="lc-event__link" href="/events/toddler-time">L’heure des tout-petits</a><div class="lc-event-info-item--time">10:30am - 11:00am</div></article>`;
  const items = parseDrupalFeedItemsForRegression(html, '2026-09-30',
    'https://www.library.cornwall.on.ca/events/feed/html?current_date=2026-09-30',
    'Cornwall Public Library');
  assert.equal(items.length, 1);
  assert.equal(items[0].relevantImageIndex, -1);
});

test('linked calendar duplicates inherit the matching flyer without attaching unrelated items', () => {
  const flyer = [
    { name: 'Adult Craft: Book Bedazzling', date: '2026-10-02',
      startTime: '10:30 A.M.', relevantImageIndex: 1 },
    { name: 'Weekend Wonder: Fall Scavenger Hunt', date: '2026-10-03',
      startTime: '11:00 A.M.', relevantImageIndex: 1 },
  ] as any[];
  const website = [
    { name: 'Adult Craft: Book Bedazzling', date: '2026-10-02',
      startTime: '10:30', relevantImageIndex: -1 },
    { name: 'Weekend Wonder: Fall Nature Scavenger Hunt', date: '2026-10-03',
      startTime: '11:00', relevantImageIndex: -1 },
    { name: 'After School: Ponder Post', date: '2026-10-01',
      startTime: '16:00', relevantImageIndex: -1 },
  ] as any[];
  const merged = mergeCalendarFeedItemsForRegression(flyer, website);
  assert.deepEqual(merged.slice(2).map(item => item.relevantImageIndex), [1, 1, -1]);
  assert.deepEqual(website.map(item => item.relevantImageIndex), [-1, -1, -1]);
});

test('linked calendar fetch includes printed flyer dates outside the current website month', () => {
  const urls = collectFeedUrlsForRegression(
    'https://www.library.cornwall.on.ca/events',
    '<script>{"htmlFeedUrl":"/events/feed/html"}</script>',
    { start: '2026-10-01', end: '2026-10-01', dates: ['2026-10-01'] },
    [{ date: '2026-09-28' } as any]
  );
  assert.deepEqual(urls.map(url => new URL(url).searchParams.get('current_date')),
    ['2026-10-01', '2026-09-28']);
});

test('linked calendar corroborates an ambiguous flyer time and preserves its image', () => {
  const merged = mergeCalendarFeedItemsForRegression([
    { name: 'Cercle de conversation en français', date: '2026-09-28',
      startTime: '7 h 00 (meridiem unspecified)', relevantImageIndex: 0 } as any,
  ], [
    { name: 'French Conversation Circle | Cercle de conversation en français',
      date: '2026-09-28', startTime: '19:00', endTime: '20:00',
      relevantImageIndex: -1 } as any,
  ]);
  assert.equal(merged[0].startTime, '19:00');
  assert.equal(merged[0].relevantImageIndex, 0);
  assert.equal(merged[1].relevantImageIndex, 0);
});

test('source-anchored linked calendar fetches only printed dates', () => {
  const urls = collectFeedUrlsForRegression(
    'https://www.library.cornwall.on.ca/events',
    '<script>{"htmlFeedUrl":"/events/feed/html"}</script>',
    { start: '2026-10-01', end: '2026-10-02',
      dates: ['2026-10-01', '2026-10-02'] },
    [{ date: '2026-09-28' } as any], true
  );
  assert.deepEqual(urls.map(url => new URL(url).searchParams.get('current_date')),
    ['2026-09-28']);
});

test('source-anchored calendar enriches printed events without adding unrelated website items', () => {
  const flyer = [
    { name: 'Cercle de conversation en français', date: '2026-09-28',
      startTime: '7 h 00 (meridiem unspecified)', relevantImageIndex: 0 },
    { name: 'After School Activities', date: '2026-10-01',
      startTime: '4:00 P.M.', relevantImageIndex: 1 },
  ] as any[];
  const website = [
    { name: 'French Conversation Circle | Cercle de conversation en français',
      date: '2026-09-28', startTime: '19:00', endTime: '20:00',
      relevantImageIndex: -1 },
    { name: 'Unrelated Chess Club', date: '2026-10-01',
      startTime: '16:00', relevantImageIndex: -1 },
  ] as any[];
  const enriched = mergeWebsiteDetailsIntoFlyerForRegression(flyer, website);
  assert.equal(enriched.length, 2);
  assert.equal(enriched[0].startTime, '19:00');
  assert.equal(enriched[0].endTime, '20:00');
  assert.deepEqual(enriched.map(item => item.relevantImageIndex), [0, 1]);
});
