import assert from 'node:assert/strict';
import http from 'node:http';

// Local Responses API mock: exercises audit orchestration without billed calls,
// Firestore access, or parser configuration changes.
const responseQueue = [];
let requestCount = 0;
const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  assert.equal(request.url, '/v1/responses');
  assert.equal(JSON.parse(body).model, 'gpt-6-luna');
  requestCount++;
  const reply = responseQueue.shift();
  assert.ok(reply, 'unexpected Responses request');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(reply));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.OPENAI_API_KEY = 'local-mock-only';
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
const { auditCalendarInventory } = await import('../lib/parsing/eventExtractor.js');
const { DEFAULT_PARSING_CONFIG } = await import('../lib/parsing/types.js');
const rawEvent = (title, start_time, excerpt = 'An explicitly printed event on the source poster') => ({
  date_heading: 'September 27', title, start_time, end_time: '',
  performers: [], venue: '', excerpt,
});
const responseFor = (events, status = 'completed') => ({
  id: `resp_local_${requestCount}`, object: 'response',
  created_at: 1790950000, status, model: 'gpt-6-luna',
  ...(status !== 'completed' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
  output: [{ id: 'msg_local', type: 'message', role: 'assistant', status,
    content: [{ type: 'output_text', text: JSON.stringify({ events }), annotations: [] }] }],
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
});
const primary = [{ name: "SAM'S FAMILY FUN DAY", date: '2026-09-27',
  startTime: '13:00', type: 'event', venue: '' }];
const frame0 = [rawEvent("SAM'S FAMILY FUN DAY", '1pm'),
  rawEvent('CORNBOIL & COMMUNITY BBQ', '2pm')];
const cases = [
  { name: 'all_complete', responses: [responseFor(frame0)], frames: [0],
    expected: ['completed'], additions: 1 },
  { name: 'second_empty', responses: [responseFor(frame0), responseFor([])],
    frames: [0, 1], expected: ['completed', 'empty_inventory'], additions: 0 },
  { name: 'second_malformed', responses: [responseFor(frame0), responseFor([null])],
    frames: [0, 1], expected: ['completed', 'invalid_schema'], additions: 0,
    malformed: 1 },
  { name: 'incomplete_json', responses: [responseFor(frame0, 'incomplete')],
    frames: [0], expected: ['incomplete_response'], additions: 0 },
  { name: 'mixed_malformed_member', responses: [responseFor([...frame0, { title: {} }])],
    frames: [0], expected: ['invalid_schema'], additions: 0, malformed: 1 },
];
const results = [];
try {
  for (const testCase of cases) {
    responseQueue.push(...testCase.responses);
    let snapshot;
    const additions = await auditCalendarInventory(primary,
      testCase.frames.map(index => `https://example.invalid/source-${index}.png`), {
        ...DEFAULT_PARSING_CONFIG,
        calendarInventoryAudit: {
          enabled: true, estimatedItemCount: 10,
          frameSourceGalleryIndices: [0, 1], denseFrameIndices: testCase.frames,
          maxFrames: 2, applyAdditions: true,
          handler: value => { snapshot = value; },
        },
      });
    assert.ok(snapshot, `${testCase.name}: missing audit snapshot`);
    assert.deepEqual(snapshot.frameReadOutcomes.map(outcome => outcome.status),
      testCase.expected, testCase.name);
    assert.equal(snapshot.malformedListings.length, testCase.malformed || 0,
      testCase.name);
    assert.equal(additions.length, testCase.additions, testCase.name);
    results.push({ name: testCase.name, outcomes: testCase.expected,
      additions: additions.length, rawListingCount: snapshot.rawListingCount });
  }
  assert.equal(responseQueue.length, 0);
  assert.equal(requestCount, cases.reduce((count, value) => count + value.frames.length, 0));
  console.log(JSON.stringify({ mockedRequests: requestCount, results }));
} finally {
  server.close();
}
