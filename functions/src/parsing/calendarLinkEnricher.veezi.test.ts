import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVeeziMonthItems } from './calendarLinkEnricher.js';

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
});
