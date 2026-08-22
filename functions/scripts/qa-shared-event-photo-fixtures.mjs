import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSharedEventImageItemsForRegression } from '../lib/processing/sharedEventParser.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const functionsDirectory = path.resolve(scriptDirectory, '..');
const fixtureDirectory = path.join(
  functionsDirectory,
  'test-fixtures',
  'generated-shared-event-posters'
);
const reportPath = path.join(fixtureDirectory, 'qa-report.json');
const referenceTimestamp = '2026-08-22T12:00:00-03:00';

const fixtures = [
  {
    file: '01-standard-concert.png',
    expectations: [
      ['title', (items) => items.some((item) => /harbou?r lights concert/i.test(item.name))],
      ['date', (items) => items.some((item) => item.date === '2026-09-12')],
      ['time', (items) => items.some((item) => item.startTime === '19:00' && item.endTime === '21:30')],
      ['venue', (items) => items.some((item) => /victoria park cultural pavilion/i.test(item.venue))],
    ],
  },
  {
    file: '02-multi-event-calendar.png',
    expectations: [
      ['three events', (items) => items.length === 3],
      ['storytelling', (items) => hasEvent(items, 'storytelling night', '2026-09-10', '18:30', '20:00')],
      ['craft workshop', (items) => hasEvent(items, 'family craft workshop', '2026-09-19', '10:00', '12:00')],
      ['acoustic sunday', (items) => hasEvent(items, 'acoustic sunday', '2026-09-27', '14:00', '16:00')],
      ['venue', (items) => items.every((item) => /beaconsfield carriage house/i.test(item.venue))],
    ],
  },
  {
    file: '03-food-happy-hour-special.png',
    expectations: [
      ['special classification', (items) => items.some((item) => item.type === 'special')],
      ['offer', (items) => items.some((item) => /happy hour|mussels|mocktails/i.test(item.name))],
      ['date range start', (items) => items.some((item) => item.date === '2026-08-25')],
      ['time', (items) => items.some((item) => item.startTime === '16:00' && item.endTime === '18:00')],
      ['venue', (items) => items.some((item) => /harbour house bistro/i.test(item.venue))],
      ['finite recurrence', (items) => items.some((item) => (
        item.recurringPattern === 'weekly_custom' &&
        Array.isArray(item.recurringDaysOfWeek) &&
        item.recurringDaysOfWeek.length === 4 &&
        item.recurrenceUntilDate === '2026-09-30'
      ))],
    ],
  },
  {
    file: '04-route-lantern-walk.png',
    expectations: [
      ['title', (items) => items.some((item) => /charlott+etown lantern walk/i.test(item.name))],
      ['date', (items) => items.some((item) => item.date === '2026-09-19')],
      ['time', (items) => items.some((item) => item.startTime === '19:30' && item.endTime === '21:00')],
      ['route evidence', (items) => items.some((item) => (
        /founders|confederation landing|victoria park|approximate 2 km/i.test([
          item.name,
          item.description,
          item.venue,
          item.address,
          item.extractionReason,
        ].filter(Boolean).join(' '))
      ))],
    ],
  },
  {
    file: '05-unknown-private-address-venue.png',
    expectations: [
      ['title', (items) => items.some((item) => /neighbourhood game night/i.test(item.name))],
      ['date', (items) => items.some((item) => item.date === '2026-09-24')],
      ['time', (items) => items.some((item) => item.startTime === '18:30' && item.endTime === '20:30')],
      ['invented venue', (items) => items.some((item) => /maple fox community studio/i.test(item.venue))],
      ['private address evidence', (items) => items.some((item) => Boolean(String(item.address || '').trim()))],
    ],
  },
];

function hasEvent(items, name, date, startTime, endTime) {
  return items.some((item) => (
    String(item.name || '').toLowerCase().includes(name) &&
    item.date === date &&
    item.startTime === startTime &&
    item.endTime === endTime
  ));
}

function normalizeClock(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/i);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2] || '00';
  if (match[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function compactItem(item) {
  return {
    type: item.type || item._sourceType || 'event',
    name: item.name,
    description: item.description,
    date: item.date,
    startTime: normalizeClock(item.startTime),
    endTime: normalizeClock(item.endTime),
    venue: item.venue,
    address: item.address,
    price: item.price || item.pricing,
    recurringPattern: item.recurringPattern,
    recurringDaysOfWeek: item.recurringDaysOfWeek,
    recurrenceUntilDate: item.recurrenceUntilDate,
    extractionReason: item.extractionReason,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  referenceTimestamp,
  extractor: 'shared-event image classifier and routed extractor',
  fixtures: [],
};

for (const fixture of fixtures) {
  const startedAt = Date.now();
  try {
    const bytes = await readFile(path.join(fixtureDirectory, fixture.file));
    const imageUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const extraction = await extractSharedEventImageItemsForRegression({
      imageUrls: [imageUrl],
      sourceName: 'Shared photo QA fixture',
      timestamp: referenceTimestamp,
    });
    const extracted = extraction.items.map((item) => ({
      ...item,
      type: item.type || item._sourceType || (
        extraction.contentType === 'FOOD_SPECIAL' ? 'special' : 'event'
      ),
      startTime: normalizeClock(item.startTime),
      endTime: normalizeClock(item.endTime),
    }));
    const checks = fixture.expectations.map(([name, predicate]) => ({
      name,
      passed: Boolean(predicate(extracted)),
    }));
    report.fixtures.push({
      file: fixture.file,
      passed: checks.every((check) => check.passed),
      durationMs: Date.now() - startedAt,
      contentType: extraction.contentType,
      classificationConfidence: extraction.classificationConfidence,
      checks,
      items: extracted.map(compactItem),
    });
  } catch (error) {
    report.fixtures.push({
      file: fixture.file,
      passed: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      checks: [],
      items: [],
    });
  }
}

report.passed = report.fixtures.every((fixture) => fixture.passed);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const fixture of report.fixtures) {
  const failedChecks = fixture.checks.filter((check) => !check.passed).map((check) => check.name);
  console.log(JSON.stringify({
    file: fixture.file,
    passed: fixture.passed,
    itemCount: fixture.items.length,
    failedChecks,
    error: fixture.error,
  }));
}
console.log(JSON.stringify({ reportPath, passed: report.passed }));
process.exitCode = report.passed ? 0 : 1;
