import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStage3FallbackForRegression, parseStage3JsonForRegression } from './eventExtractor.js';

const registrationUrl = 'https://thelocker.coach.ca/event/registration/15590';
const event = {
  name: 'NCCP Managing Conflict',
  date: '2026-10-13',
  startTime: '18:00',
  endTime: '21:00',
  ticketLink: registrationUrl,
  description: `Registration: ${registrationUrl}`,
};

test('Stage 3 keeps a valid registration URL when reading an event response', () => {
  const response = JSON.stringify({ extractedEvents: [event], extractionSummary: { totalFound: 1 } });
  assert.deepEqual(parseStage3JsonForRegression(response)?.extractedEvents, [event]);
});

test('Stage 3 fallback keeps a URL in fenced JSON with an actual comment', () => {
  const response = `\`\`\`json\n{\n// explanatory model comment\n"items": [${JSON.stringify(event)}]\n}\n\`\`\``;
  assert.deepEqual(parseStage3FallbackForRegression(response), [event]);
});
