import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  applyStage1LocalDecisionGates,
  createCompactValidationPrompt,
  createCompactV5ValidationPrompt,
  createCompactV4ValidationPrompt,
  createCompactV3ValidationPrompt,
  createCompactV2ValidationPrompt,
  createValidationPrompt,
  createValidationSchema,
  detectCalendarSignals,
  normalizeValidationResponse,
  Stage1EvaluationArtifactError,
  validateContentForStage1Evaluation,
} from '../lib/parsing/contentValidator.js';
import {
  assessImageAnalysis,
  appendJsonlRecord,
  calculateObservedCostUsd,
  DEFAULT_VARIANT_IDS,
  getCaseSourceIdentity,
  estimateRequestCostUsd,
  getCompletedResumeKeys,
  getVariants,
  historicalSpendFromCaseRecords,
  historicalSpendFromOutputRecords,
  loadAndValidateManifest,
  makeSourceTruthScore,
  MAX_ESTIMATED_SPEND_USD,
  readImagesAsDataUrls,
  runWithConcurrency,
  selectCases,
  selectImagesForCase,
  selectVariants,
  Stage1EvaluationBudgetError,
  Stage1SpendBudget,
  validateEstimatedSpendLimit,
  validateEvaluationConcurrency,
} from './stage1-evaluation-lib.mjs';

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(functionsRoot, 'test', 'fixtures', 'stage1-oct8');
const manifestPath = path.join(fixtureRoot, 'manifest.json');

function validationResult(imageCount, decision = true) {
  return {
    imageAnalysis: Array.from({ length: imageCount }, (_, index) => ({
      imageIndex: index,
      description: `Source image ${index} contains a clear image-specific cue.`,
      relevanceToPost: `Image ${index} supports the post.`,
      imageComplexity: {
        hasCalendarGrid: false,
        hasDenseText: false,
        hasMultipleEventListings: false,
        isPromotionalPhoto: true,
        textDensityScore: 0.2,
        recommendsTiling: false,
        recommendationReason: 'Mostly photographic.',
      },
    })),
    hasValidContent: decision,
    confidence: 0.9,
    validationDecision: decision ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    reason: decision ? 'Specific event or offer.' : 'No qualifying source content.',
  };
}

function apiResponse(payload, overrides = {}) {
  return {
    id: 'resp_mock_1',
    status: 'completed',
    output_text: JSON.stringify(payload),
    usage: {
      input_tokens: 1200,
      output_tokens: 80,
      total_tokens: 1280,
      input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 7 },
    },
    ...overrides,
  };
}

function fakeClient(sequence) {
  const calls = [];
  const client = {
    responses: {
      create: async (request) => {
        calls.push(request);
        const next = sequence.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
  return { client, calls };
}

function getInputText(request) {
  return request.input[0].content.find((part) => part.type === 'input_text').text;
}

test('current GPT-5 mini arm keeps the production prompt, schema hint, and Responses request shape', async () => {
  const caption = 'No named event details in this caption.';
  const imageUrls = ['data:image/jpeg;base64,Zm9v'];
  const { client, calls } = fakeClient([apiResponse(validationResult(1))]);
  const usageEvents = [];
  const run = await validateContentForStage1Evaluation(
    caption,
    imageUrls,
    'A&W Restaurants, PEI',
    '2026-10-07T00:00:00.000Z',
    'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client },
    { gptUsageHandler: (usage) => usageEvents.push(usage) }
  );

  assert.equal(run.status, 'completed');
  assert.equal(run.attempts.length, 1);
  assert.equal(run.attempts[0].requestKind, 'initial');
  assert.equal(run.attempts[0].imageCount, 1);
  assert.equal(run.attempts[0].responseId, 'resp_mock_1');
  assert.equal(run.attempts[0].reasoningTokens, 7);
  assert.equal(run.attempts[0].visibleOutput, JSON.stringify(validationResult(1)));
  assert.equal(usageEvents[0].responseStatus, 'completed');
  assert.equal(usageEvents[0].reasoningTokens, 7);
  assert.equal(usageEvents[0].visibleOutputChars, run.attempts[0].visibleOutput.length);

  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.model, 'gpt-5-mini');
  assert.equal(request.max_output_tokens, 2000);
  assert.equal(request.input[0].content.length, 2);
  assert.equal(request.input[0].content[1].type, 'input_image');
  assert.equal(request.input[0].content[1].image_url, imageUrls[0]);
  assert.equal(request.text, undefined);
  assert.equal(request.tools, undefined);
  const exactProductionPrompt = createValidationPrompt(
    caption,
    true,
    'A&W Restaurants, PEI',
    '2026-10-07T00:00:00.000Z'
  );
  const exactCurrentRequestText = `${exactProductionPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`;
  assert.equal(getInputText(request), exactCurrentRequestText);
});

test('compact Structured Outputs arm uses the same schema without adding a new decision policy', async () => {
  const caption = 'A dated workshop with registration details.';
  const { client, calls } = fakeClient([apiResponse(validationResult(2))]);
  const run = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v', 'data:image/jpeg;base64,YmFy'],
    'Test venue',
    '2026-10-07T00:00:00.000Z',
    'gpt-5-mini',
    { promptVariant: 'compact', structuredOutput: true, client }
  );

  assert.equal(run.status, 'completed');
  const request = calls[0];
  const compactPrompt = getInputText(request);
  const productionPrompt = createValidationPrompt(caption, true, 'Test venue', '2026-10-07T00:00:00.000Z');
  assert.equal(compactPrompt, createCompactValidationPrompt(caption, true, 'Test venue', '2026-10-07T00:00:00.000Z'));
  assert.ok(compactPrompt.length < productionPrompt.length);
  assert.match(compactPrompt, /An explicitly advertised daily special or deal qualifies even without a printed price/);
  assert.doesNotMatch(compactPrompt, /merchandise|retail discount/i);
  assert.deepEqual(request.text.format, {
    type: 'json_schema',
    name: 'validateContent',
    strict: true,
    schema: createValidationSchema()[0].parameters,
  });
  assert.equal(request.max_output_tokens, 2000);
  assert.equal(request.input[0].content.filter((part) => part.type === 'input_image').length, 2);
});

test('compact-v2 prompt states activity, open facility, special, trail, and exclusion policy without fixture rows', () => {
  const policyFixtures = [
    { expected: 'accept', text: 'Registration is open for a bookable pottery class; dates will be confirmed after signup.' },
    { expected: 'accept', text: 'Public swim availability is open for community bookings; the schedule is being posted.' },
    { expected: 'accept', text: 'Today’s daily soup special is available; no price is printed.' },
    { expected: 'accept', text: 'Visit the community dessert trail October 5 through 9.' },
    { expected: 'accept', text: 'Join the community dessert trail; current participation is open.' },
    { expected: 'accept', text: 'A retail sale is posted alongside a clearly advertised live performance.' },
    { expected: 'reject', text: 'Retail sweaters are discounted by 20% this weekend.' },
    { expected: 'reject', text: 'Fresh pumpkins are back in stock.' },
    { expected: 'reject', text: 'Our new fall menu and featured dishes are here.' },
    { expected: 'reject', text: 'Election candidate nomination forms are available at the office.' },
    { expected: 'reject', text: 'A photo recap shows last week’s pottery activity with no current invitation.' },
    { expected: 'reject', text: 'The facility is generally open from 9 AM to 5 PM.' },
  ];
  const prompt = createCompactV2ValidationPrompt('No fixture text is included here.', true, 'Test venue', '2026-10-08');
  assert.match(prompt, /bookable activities.*even when a date or time is missing/i);
  assert.match(prompt, /public open-swim or bookable rink availability.*even when a date or time is missing/i);
  assert.match(prompt, /daily food\/drink specials or deals, even when no numeric price/i);
  assert.match(prompt, /community food or dessert trails.*not required at Stage 1/i);
  assert.match(prompt, /election administration, nomination, ballot, or candidate-filing/i);
  assert.match(prompt, /retail merchandise discounts, sales, stock availability, or restock/i);
  assert.match(prompt, /menu or featured-item announcements without an explicitly advertised daily special/i);
  assert.match(prompt, /retrospective activity photos or recaps with no current invitation/i);
  assert.match(prompt, /never from the venue name or business category alone/i);
  assert.match(prompt, /If a post mixes qualifying activity\/special content.*accept the post for its qualifying portion/i);
  assert.equal(policyFixtures.filter((item) => item.expected === 'accept').length, 6);
  assert.equal(policyFixtures.filter((item) => item.expected === 'reject').length, 6);
  for (const fixture of policyFixtures) assert.equal(prompt.includes(fixture.text), false);
  assert.doesNotMatch(prompt, /row-\d+|sourceRow|caseId/i);
});

test('compact-v3 prompt distinguishes public events, public access, food offers, and non-events without fixture rows', () => {
  const policyFixtures = [
    { expected: 'accept', text: 'The public is invited to a council information session Thursday at 6 PM.' },
    { expected: 'accept', text: 'Join the Fall Harvest Fair October 17–18.' },
    { expected: 'accept', text: 'Visit the farm for an open farm day this Saturday; admission is $8.' },
    { expected: 'accept', text: 'Book an interactive behind-the-scenes tour; reservations are open.' },
    { expected: 'accept', text: 'Public swim is available today from noon to 4 PM.' },
    { expected: 'accept', text: 'Apples and carrots are 20% off in our grocery store today.' },
    { expected: 'accept', text: 'All residents are welcome at the public election forum on Saturday.' },
    { expected: 'accept', text: 'Bring donations to the public community food drive Saturday from 11 AM to 2 PM.' },
    { expected: 'accept', text: 'Free apples are available for visitors at the orchard today.' },
    { expected: 'accept', text: 'Follow the self-guided local pastry trail with participating stops.' },
    { expected: 'accept', text: 'The track race takes place Saturday and will also be carried on the local station.' },
    { expected: 'reject', text: 'Candidate nomination forms are due Friday.' },
    { expected: 'reject', text: 'Winter coats are 20% off this weekend.' },
    { expected: 'reject', text: 'Our seasonal latte is back and available through October.' },
    { expected: 'reject', text: 'New pies just arrived; quantities are limited.' },
    { expected: 'reject', text: 'Friday’s radio programs air on the station at 7 PM.' },
    { expected: 'reject', text: 'The facility is open Monday through Friday from 9 AM to 5 PM.' },
    { expected: 'reject', text: 'Our fall cafe menu is now available.' },
    { expected: 'reject', text: 'The featured dishes rotate throughout the month with no advertised deal.' },
    { expected: 'reject', text: 'Photos recap last week’s workshop; no future session or booking is announced.' },
  ];
  const prompt = createCompactV3ValidationPrompt('No fixture text is included here.', true, 'Test venue', '2026-10-08');
  assert.match(prompt, /Public meetings, hearings, forums, and information sessions.*public attendance/i);
  assert.match(prompt, /Named or date-range public festivals, fairs, performances, and community activities/i);
  assert.match(prompt, /Public farm or attraction visits, admission offers, interactive tours, and bookable classes or activities/i);
  assert.match(prompt, /Public food drives and food collection\/drop-off events.*organized food trails or self-guided circuits/i);
  assert.match(prompt, /free food or drink offers to visitors/i);
  assert.match(prompt, /Public open-swim, rink, or similar recreational access/i);
  assert.match(prompt, /food or drink specials, deals, and discounts, including grocery food offers/i);
  assert.match(prompt, /Election administration notices.*A separately announced public meeting or forum can still qualify/i);
  assert.match(prompt, /Discounts on non-food retail merchandise/i);
  assert.match(prompt, /Month-long or rotating menus and featured flavors\/items without a specific food\/drink deal/i);
  assert.match(prompt, /Past-only activity photos or recaps without a clear current or upcoming invitation/i);
  assert.match(prompt, /Broadcast-only radio or show airtime without an announced public gathering/i);
  assert.match(prompt, /When broadcast details confirm an underlying public event at a venue, accept the physical event and do not treat its coverage as a second event/i);
  assert.match(prompt, /never from the venue name or business category alone/i);
  assert.equal(policyFixtures.filter((item) => item.expected === 'accept').length, 11);
  assert.equal(policyFixtures.filter((item) => item.expected === 'reject').length, 9);
  for (const fixture of policyFixtures) assert.equal(prompt.includes(fixture.text), false);
  assert.doesNotMatch(prompt, /row-\d+|sourceRow|caseId/i);
});

test('compact-v3 prompt text stays frozen for the completed v3 run', () => {
  const prompt = createCompactV3ValidationPrompt(
    'No fixture text is included here.', true, 'Test venue', '2026-10-08'
  );
  assert.equal(
    createHash('sha256').update(prompt).digest('hex'),
    '3a0cb4cbbc0f43b6a646fb5ec362efdea5fc653cd4ab88fca4ecec921076cb78'
  );
});

test('compact-v3 evaluation requests use the compact-v3 prompt', async () => {
  const caption = 'Public farm tour this Saturday; booking is open.';
  const { client, calls } = fakeClient([apiResponse(validationResult(2))]);
  const run = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v3', structuredOutput: false, client }
  );

  assert.equal(run.status, 'completed');
  const expectedPrompt = createCompactV3ValidationPrompt(caption, true, 'Test venue', '2026-10-08T00:00:00.000Z');
  assert.equal(getInputText(calls[0]), `${expectedPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`);
});

test('compact-v4 policy accepts named activities and dated recreation while rejecting ordinary stock and hours', () => {
  const policyFixtures = [
    { expected: 'accept', text: 'TRIVIA NIGHT' },
    { expected: 'accept', text: 'The fitness room and track are open to the public on October 12 from 7 AM to 10:30 PM.' },
    { expected: 'accept', text: 'Follow the named self-guided cinnamon roll circuit; the participating locations will be shared later.' },
    { expected: 'accept', text: 'Free apple samples for visitors this Saturday.' },
    { expected: 'accept', text: 'Apples and carrots are 20% off at the grocery store today.' },
    { expected: 'accept', text: 'Our pork belly omelette is a limited-time offer.' },
    { expected: 'reject', text: 'Our dairy-free watermelon flavor is available now; get it before it is gone. The shop closes for the season at month end.' },
    { expected: 'reject', text: 'We are fully stocked with pumpkins and freezer treats. Stop by and stock up this weekend.' },
    { expected: 'reject', text: 'The retail shop is open Monday through Friday from 9 AM to 5 PM.' },
    { expected: 'reject', text: 'Christmas décor is 25% off this week.' },
    { expected: 'reject', text: 'Our featured dishes rotate throughout the month with no deal or special.' },
    { expected: 'reject', text: 'Photos recap last week’s workshop, with no future session announced.' },
  ];
  const prompt = createCompactV4ValidationPrompt('No fixture text is included here.', true, 'Test venue', '2026-10-08');
  assert.match(prompt, /Event posters or program listings with a concrete public activity title, including trivia, live music, comedy, workshops, classes/i);
  assert.match(prompt, /The poster itself counts as the current announcement even if the caption is empty and no date, time, schedule, or extra invitation text is shown/i);
  assert.match(prompt, /Public access windows for recreational facilities such as fitness rooms, tracks, pools, and rinks.*specific date or period/i);
  assert.match(prompt, /A named organized public food trail, circuit, or self-guided tour.*Missing dates, routes, participating locations, or schedules do not make the named activity invalid/i);
  assert.match(prompt, /Ordinary product, produce, flavor, menu, and stock availability.*General invitations to visit, shop, buy, stock up, try an item, or get it before it is gone do not turn ordinary inventory into a special or deal/i);
  assert.match(prompt, /A clearly stated free giveaway, sample, or no-cost promotion to the public also qualifies/i);
  assert.match(prompt, /hasValidContent to true exactly when validationDecision is VALIDATION_PASSED/i);
  assert.match(prompt, /hasValidContent to false exactly when validationDecision is VALIDATION_FAILED/i);
  assert.match(prompt, /The reason must plainly support that same decision/i);
  assert.equal(policyFixtures.filter((item) => item.expected === 'accept').length, 6);
  assert.equal(policyFixtures.filter((item) => item.expected === 'reject').length, 6);
  for (const fixture of policyFixtures) assert.equal(prompt.includes(fixture.text), false);
  assert.doesNotMatch(prompt, /row-\d+|sourceRow|caseId/i);
});

test('compact-v4 prompt text stays frozen for the completed v4 run', () => {
  const prompt = createCompactV4ValidationPrompt(
    'No fixture text is included here.', true, 'Test venue', '2026-10-08'
  );
  assert.equal(
    createHash('sha256').update(prompt).digest('hex'),
    '3c9ced9cc88d9a0ebe9b7fc5cccc272e3c5c7d3734b3ff22551a06fa914ba202'
  );
});

test('compact-v4 evaluation requests use the compact-v4 prompt', async () => {
  const caption = 'A community trivia night is announced on the attached poster.';
  const { client, calls } = fakeClient([apiResponse(validationResult(1))]);
  const run = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v4', structuredOutput: false, client }
  );

  assert.equal(run.status, 'completed');
  const expectedPrompt = createCompactV4ValidationPrompt(caption, true, 'Test venue', '2026-10-08T00:00:00.000Z');
  assert.equal(getInputText(calls[0]), `${expectedPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`);
});

test('compact-v5 preserves public activity recall while separating daily offers, ordinary inventory, and online engagement', () => {
  const policyFixtures = [
    { expected: 'accept', text: 'TRIVIA NIGHT' },
    { expected: 'accept', text: 'Today’s feature is a sandwich-and-beverage combo; the price is not listed.' },
    { expected: 'accept', text: 'A fall admission sale is on now; the notice gives no numeric amount.' },
    { expected: 'accept', text: 'Visit the heritage museum through October 16; public hours are weekdays from 10 AM to 4 PM.' },
    { expected: 'accept', text: 'The public fitness room and track are available Sunday from 7 AM to 9 PM.' },
    { expected: 'accept', text: 'The self-guided community food circuit is returning; route details will follow.' },
    { expected: 'accept', text: 'Free cider samples are offered in person to visitors today.' },
    { expected: 'accept', text: 'The public community food drive accepts drop-offs Saturday from noon to 2 PM.' },
    { expected: 'accept', text: 'A public interactive tour is announced for a future date; schedule details will follow.' },
    { expected: 'accept', text: 'The daily soup special is available today; no price is printed.' },
    { expected: 'accept', text: 'A grocery food deal is advertised without a numeric discount.' },
    { expected: 'accept', text: 'Join our live virtual trivia at 7 PM on Thursday.' },
    { expected: 'reject', text: 'Our featured menu rotates throughout the month; there is no special or deal.' },
    { expected: 'reject', text: 'The seasonal berry flavor is in stock; get it before it is gone.' },
    { expected: 'reject', text: 'Ordinary produce boxes are available for pickup this week.' },
    { expected: 'reject', text: 'Christmas ornaments are 25% off.' },
    { expected: 'reject', text: 'Like this post and comment to enter the online dessert prize draw.' },
    { expected: 'reject', text: 'Answer this trivia question in the comments and check back next week.' },
    { expected: 'reject', text: 'Photos show the author’s past apple-picking family outing.' },
    { expected: 'reject', text: 'The office is open Monday through Friday from 9 AM to 5 PM.' },
    { expected: 'reject', text: 'Candidate filing forms are due Friday.' },
    { expected: 'reject', text: 'The radio station airs a recorded program at 7 PM.' },
  ];
  const prompt = createCompactV5ValidationPrompt('No fixture text is included here.', true, 'Test venue', '2026-10-08');
  assert.match(prompt, /A concrete public event\/activity title in a poster or program listing.*trivia, live music, comedy, workshops, classes/i);
  assert.match(prompt, /The poster itself is a current announcement even if the caption is empty or it gives no date, time, schedule/i);
  assert.match(prompt, /Public visitor access at museums, heritage sites, cultural attractions, farms, and similar attractions.*even if it is described as opening hours/i);
  assert.match(prompt, /An advertised public admission offer or admission sale, even when no numeric price or discount amount is printed/i);
  assert.match(prompt, /Explicit food\/drink specials, deals, discounts, and grocery food offers, even without a numeric price/i);
  assert.match(prompt, /today's or a specific day's feature\/special also qualifies without a price/i);
  assert.match(prompt, /Month-long or rotating menu announcements and featured dishes\/flavors without an explicit special, deal, discount, or promotional offer/i);
  assert.match(prompt, /free food\/drink sample or giveaway offered in person to visitors or through public pickup/i);
  assert.match(prompt, /Online prize draws, like\/comment\/share contests, or asynchronous social-media quizzes/i);
  assert.match(prompt, /Personal past outings, visits, or activity recaps/i);
  assert.match(prompt, /CONSISTENCY REQUIREMENT/);
  assert.equal(policyFixtures.filter((item) => item.expected === 'accept').length, 12);
  assert.equal(policyFixtures.filter((item) => item.expected === 'reject').length, 10);
  for (const fixture of policyFixtures) assert.equal(prompt.includes(fixture.text), false);
  assert.doesNotMatch(prompt, /row-\d+|sourceRow|caseId/i);
});

test('compact-v5 prompt text stays frozen for the completed v5 run', () => {
  const prompt = createCompactV5ValidationPrompt(
    'No fixture text is included here.', true, 'Test venue', '2026-10-08'
  );
  assert.equal(
    createHash('sha256').update(prompt).digest('hex'),
    '26d1e2eec11c9d1671722ed98b4012467bbcf6aa12c6df024a45966563404bdd'
  );
});

test('compact-v5 evaluation requests use the compact-v5 prompt', async () => {
  const caption = 'A public heritage site announces visitor hours for the coming weekend.';
  const { client, calls } = fakeClient([apiResponse(validationResult(1))]);
  const run = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v5', structuredOutput: false, client }
  );

  assert.equal(run.status, 'completed');
  const expectedPrompt = createCompactV5ValidationPrompt(caption, true, 'Test venue', '2026-10-08T00:00:00.000Z');
  assert.equal(getInputText(calls[0]), `${expectedPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`);
});

test('GPT-6 Stage 1 reasoning stays none by default and evaluation arms record their requested efforts', async () => {
  const caption = 'A public tour is announced for a future date.';
  const baseline = fakeClient([apiResponse(validationResult(1))]);
  const baselineRun = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v5', structuredOutput: false, client: baseline.client }
  );
  const low = fakeClient([apiResponse(validationResult(1))]);
  const lowRun = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v5', structuredOutput: false, reasoningEffort: 'low', client: low.client }
  );
  const high = fakeClient([apiResponse(validationResult(1))]);
  const highRun = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v'],
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v5', structuredOutput: false, reasoningEffort: 'high', client: high.client }
  );

  assert.equal(baselineRun.status, 'completed');
  assert.equal(lowRun.status, 'completed');
  assert.equal(highRun.status, 'completed');
  assert.deepEqual(baseline.calls[0].reasoning, { effort: 'none' });
  assert.deepEqual(low.calls[0].reasoning, { effort: 'low' });
  assert.deepEqual(high.calls[0].reasoning, { effort: 'high' });
  assert.equal(baselineRun.attempts[0].requestedReasoningEffort, 'none');
  assert.equal(lowRun.attempts[0].requestedReasoningEffort, 'low');
  assert.equal(highRun.attempts[0].requestedReasoningEffort, 'high');
  assert.equal(getInputText(baseline.calls[0]), getInputText(low.calls[0]));
  assert.equal(getInputText(baseline.calls[0]), getInputText(high.calls[0]));
});

test('offline v5 preflight records exact per-case prompt and compiled validator hashes', () => {
  const { manifest, sourceRoot } = loadAndValidateManifest(manifestPath);
  const caseData = manifest.cases[0];
  const runnerPath = path.join(functionsRoot, 'scripts', 'stage1-evaluation-runner.mjs');
  const result = spawnSync(process.execPath, [
    runnerPath,
    '--manifest', manifestPath,
    '--case-ids', caseData.caseId,
    '--variants', 'luna-compact-v5,luna-compact-v5-low,luna-compact-v5-high',
    '--image-set', 'initial',
    '--output', '-',
  ], { cwd: functionsRoot, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const plan = JSON.parse(result.stderr);
  const selectedImages = selectImagesForCase(caseData, 'initial');
  const rawPrompt = createCompactV5ValidationPrompt(
    caseData.caption, selectedImages.length > 0, caseData.venue, caseData.postedAt
  );
  const exactPrompt = `${rawPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`;
  const expectedPromptHash = createHash('sha256').update(exactPrompt).digest('hex');
  const validatorPath = path.join(functionsRoot, 'lib', 'parsing', 'contentValidator.js');
  const expectedValidatorHash = createHash('sha256').update(fs.readFileSync(validatorPath)).digest('hex');

  assert.equal(plan.mode, 'offline_preflight');
  assert.equal(plan.sourceRoot, sourceRoot);
  assert.equal(plan.cases[0].effectivePromptSha256ByVariant['luna-compact-v5'], expectedPromptHash);
  assert.equal(plan.cases[0].effectivePromptSha256ByVariant['luna-compact-v5-low'], expectedPromptHash);
  assert.equal(plan.cases[0].effectivePromptSha256ByVariant['luna-compact-v5-high'], expectedPromptHash);
  assert.deepEqual(plan.requestedReasoningEffortByVariant, {
    'luna-compact-v5': 'none',
    'luna-compact-v5-low': 'low',
    'luna-compact-v5-high': 'high',
  });
  assert.deepEqual(plan.cases[0].requestedReasoningEffortByVariant, plan.requestedReasoningEffortByVariant);
  assert.equal(plan.compiledContentValidatorSha256, expectedValidatorHash);
  assert.match(plan.compiledContentValidatorSha256, /^[a-f0-9]{64}$/);
});

test('compact-v3 sends a full five-image request and keeps a 400 no-image fallback inconclusive', async () => {
  const rejectedFullGallery = Object.assign(new Error('mock provider rejected full gallery'), { status: 400 });
  const { client, calls } = fakeClient([
    rejectedFullGallery,
    apiResponse(validationResult(0, true)),
  ]);
  const imageUrls = Array.from({ length: 5 }, (_, index) => `data:image/jpeg;base64,${Buffer.from(`image-${index}`).toString('base64')}`);
  const run = await validateContentForStage1Evaluation(
    'Caption without independently dated event details.',
    imageUrls,
    'Test venue',
    '2026-10-08T00:00:00.000Z',
    'gpt-6-luna',
    { promptVariant: 'compact-v3', structuredOutput: false, client }
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].input[0].content.filter((part) => part.type === 'input_image').length, 5);
  assert.equal(calls[1].input[0].content.filter((part) => part.type === 'input_image').length, 0);
  assert.deepEqual(run.attempts.map((attempt) => [attempt.requestKind, attempt.imageCount]), [
    ['initial', 5],
    ['no_image_fallback', 0],
  ]);
  assert.equal(run.attempts[0].status, 'error');
  assert.equal(run.status, 'inconclusive');
  assert.equal(run.noImageFallbackUsed, true);
  assert.equal(run.preGateResult.hasValidContent, true);
});

test('text-only cases send no images, retain an empty image array, and expose no-image coverage clearly', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-text-only-'));
  try {
    const caseData = {
      caseId: 'text-only-case',
      sourceRow: 237,
      fileId: 'source-file',
      venue: 'Community Venue',
      postedAt: '2026-10-08T12:00:00.000Z',
      caption: [
        'Monday at Venue One: music 7 PM',
        'Tuesday at Venue Two: trivia 8 PM',
        'Wednesday at Venue Three: comedy 9 PM',
      ].join('\n'),
      sourceTruth: { expectedDecision: 'review', rationale: 'No gold decision.' },
      gallery: { sourceImageCount: 0 },
      expectedImageAnalysisIndexes: [],
      images: [],
    };
    const tempManifestPath = path.join(tempRoot, 'manifest.json');
    fs.writeFileSync(tempManifestPath, JSON.stringify({
      manifestVersion: 1,
      sourceRoot: '.',
      cases: [caseData],
    }));
    const loaded = loadAndValidateManifest(tempManifestPath);
    const selectedImages = selectImagesForCase(loaded.manifest.cases[0], 'initial');
    assert.deepEqual(selectedImages, []);
    assert.deepEqual(readImagesAsDataUrls(selectedImages, loaded.sourceRoot), []);

    const { client, calls } = fakeClient([apiResponse(validationResult(0, false))]);
    const run = await validateContentForStage1Evaluation(
      caseData.caption,
      [],
      caseData.venue,
      caseData.postedAt,
      'gpt-6-luna',
      { promptVariant: 'compact-v2', structuredOutput: false, client }
    );
    assert.equal(run.status, 'completed');
    assert.equal(run.preGateResult.hasValidContent, false);
    assert.equal(run.result.hasValidContent, true);
    assert.match(run.result.reason, /override PASS/);
    assert.deepEqual(calls[0].input[0].content.map((part) => part.type), ['input_text']);
    assert.match(getInputText(calls[0]), /Has images: false/);
    assert.deepEqual(run.result.imageAnalysis, []);

    const imageCoverage = assessImageAnalysis(run.result, selectedImages);
    assert.equal(imageCoverage.hasImages, false);
    assert.equal(imageCoverage.coverageStatus, 'not_applicable');
    assert.deepEqual(imageCoverage.expectedIndexes, []);
    assert.deepEqual(imageCoverage.observedIndexes, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('image MIME data URLs follow JPEG, PNG, and WebP bytes rather than filename extensions', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-image-mime-'));
  try {
    const fixtures = [
      { name: 'png-with-jpg-extension.jpg', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]) },
      { name: 'webp-with-png-extension.png', mime: 'image/webp', bytes: Buffer.from('RIFF0000WEBP', 'ascii') },
      { name: 'jpeg-with-webp-extension.webp', mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    ];
    for (const fixture of fixtures) fs.writeFileSync(path.join(tempRoot, fixture.name), fixture.bytes);

    for (const fixture of fixtures) {
      const [dataUrl] = readImagesAsDataUrls([{ path: fixture.name }], tempRoot);
      assert.equal(dataUrl, `data:${fixture.mime};base64,${fixture.bytes.toString('base64')}`);
    }
    const unsupportedPath = path.join(tempRoot, 'unsupported.jpg');
    fs.writeFileSync(unsupportedPath, Buffer.from('not an image'));
    assert.throws(
      () => readImagesAsDataUrls([{ path: 'unsupported.jpg' }], tempRoot),
      /Unsupported image bytes/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('production normalizer clamps image complexity and local calendar gates remain active', () => {
  const normalized = normalizeValidationResponse({
    imageAnalysis: [{
      imageIndex: 0,
      description: 'Schedule table.',
      imageComplexity: { textDensityScore: 4, hasCalendarGrid: true },
    }],
    hasValidContent: false,
    confidence: 0.4,
    validationDecision: 'VALIDATION_FAILED',
    reason: 'Model rejected.',
  }, 'No text signals', true);
  assert.equal(normalized.imageAnalysis[0].imageComplexity.textDensityScore, 1);
  assert.equal(normalized.imageAnalysis[0].imageComplexity.hasDenseText, false);
  assert.equal(normalized.imageAnalysis[0].relevanceToPost, '');

  const calendarText = [
    'Events:',
    'Monday at Venue One: music 7 PM',
    'Tuesday at Venue Two: trivia 8 PM',
    'Wednesday at Venue Three: comedy 9 PM',
  ].join('\n');
  assert.equal(detectCalendarSignals(calendarText).hasCalendar, true);
  applyStage1LocalDecisionGates(normalized, calendarText, false);
  assert.equal(normalized.validationDecision, 'VALIDATION_PASSED');
  assert.match(normalized.reason, /override PASS/);
});

test('manifest pins hashes and distinguishes initial four-image coverage from full galleries', () => {
  const { manifest, sourceRoot } = loadAndValidateManifest(manifestPath);
  assert.equal(sourceRoot, fixtureRoot);
  assert.equal(manifest.cases.length, 12);
  assert.equal(manifest.cases.reduce((sum, item) => sum + item.images.length, 0), 27);
  const row65 = manifest.cases.find((item) => item.sourceRow === 65);
  assert.equal(selectImagesForCase(row65, 'initial').length, 4);
  assert.equal(selectImagesForCase(row65, 'full').length, 5);
  assert.deepEqual(selectImagesForCase(row65, 'full').map((image) => image.sourceGalleryIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(row65.expectedRelevantImageIndexes, [2, 3, 4]);
  assert.equal(row65.priorRunObservation.rawStage1DecisionCaptured, false);

  const manifestCopy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifestCopy.cases[0].images[0].sha256 = '0'.repeat(64);
  const tempManifest = path.join(fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'stage1-manifest-')), 'manifest.json');
  fs.writeFileSync(tempManifest, JSON.stringify(manifestCopy));
  assert.throws(() => loadAndValidateManifest(tempManifest, fixtureRoot), /SHA-256 mismatch/);

  const pathCopy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  pathCopy.cases[0].images[0].path = '../../package.json';
  const traversalManifest = path.join(path.dirname(tempManifest), 'path-manifest.json');
  fs.writeFileSync(traversalManifest, JSON.stringify(pathCopy));
  assert.throws(() => loadAndValidateManifest(traversalManifest, fixtureRoot), /must stay inside sourceRoot/);
});

test('case and variant selection supports repeated source rows and review-only source truth', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row48 = manifest.cases.find((item) => item.sourceRow === 48);
  const first = structuredClone(row48);
  first.caseId = 'file-a-row-48';
  first.dataset = 'october-8';
  first.fileId = 'file-a';
  first.sourceTruth.expectedDecision = 'review';
  first.images[0].expectedSemanticCueGroups = [];
  const second = structuredClone(first);
  second.caseId = 'file-b-row-48';
  second.fileId = 'file-b';
  const tempRoot = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'stage1-cohort-'));
  const tempManifest = path.join(tempRoot, 'manifest.json');
  fs.writeFileSync(tempManifest, JSON.stringify({
    manifestVersion: 1,
    sourceRoot: '.',
    cases: [first, second],
  }));
  const loaded = loadAndValidateManifest(tempManifest, fixtureRoot).manifest;
  assert.equal(loaded.cases.length, 2);
  assert.equal(getCaseSourceIdentity(loaded.cases[0]), 'october-8/file-a#48');
  assert.equal(getCaseSourceIdentity(loaded.cases[1]), 'october-8/file-b#48');
  assert.deepEqual(loaded.cases[0].images[0].expectedSemanticCueGroups, []);
  assert.equal(makeSourceTruthScore(loaded.cases[0], 'completed', { hasValidContent: true }).matches, null);
  assert.equal(makeSourceTruthScore(loaded.cases[0], 'completed', { hasValidContent: true }).goldDecisionAvailable, false);

  const duplicateIdentity = structuredClone(second);
  duplicateIdentity.caseId = 'duplicate-file-a-row-48';
  duplicateIdentity.fileId = 'file-a';
  fs.writeFileSync(tempManifest, JSON.stringify({
    manifestVersion: 1,
    sourceRoot: '.',
    cases: [first, duplicateIdentity],
  }));
  assert.throws(() => loadAndValidateManifest(tempManifest, fixtureRoot), /Duplicate source identity/);
});

test('selected variant and case lists reject unknown or duplicate IDs', () => {
  assert.deepEqual(DEFAULT_VARIANT_IDS, ['mini-current', 'mini-compact-structured', 'luna-current']);
  assert.deepEqual(selectVariants(['luna-compact-v2']).map((variant) => [variant.model, variant.promptVariant]), [
    ['gpt-6-luna', 'compact-v2'],
  ]);
  assert.deepEqual(selectVariants(['luna-compact-v3']).map((variant) => [variant.model, variant.promptVariant]), [
    ['gpt-6-luna', 'compact-v3'],
  ]);
  assert.deepEqual(selectVariants(['luna-compact-v4']).map((variant) => [variant.model, variant.promptVariant]), [
    ['gpt-6-luna', 'compact-v4'],
  ]);
  assert.deepEqual(selectVariants(['luna-compact-v5']).map((variant) => [variant.model, variant.promptVariant]), [
    ['gpt-6-luna', 'compact-v5'],
  ]);
  assert.deepEqual(selectVariants(['luna-compact-v5-low']).map((variant) => [
    variant.model, variant.promptVariant, variant.reasoningEffort,
  ]), [['gpt-6-luna', 'compact-v5', 'low']]);
  assert.deepEqual(selectVariants(['luna-compact-v5-high']).map((variant) => [
    variant.model, variant.promptVariant, variant.reasoningEffort,
  ]), [['gpt-6-luna', 'compact-v5', 'high']]);
  assert.throws(() => selectVariants(['luna-compact-v2', 'luna-compact-v2']), /Duplicate variant ID/);
  assert.throws(() => selectVariants(['unknown-arm']), /Unknown variant ID/);
  const { manifest } = loadAndValidateManifest(manifestPath);
  const selected = selectCases(manifest, [manifest.cases[2].caseId]);
  assert.deepEqual(selected.map((item) => item.caseId), [manifest.cases[2].caseId]);
  assert.throws(() => selectCases(manifest, ['missing-case']), /Unknown case ID/);
});

test('semantic association catches swapped but nonempty image descriptions and cross-image time contamination', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row65 = manifest.cases.find((item) => item.sourceRow === 65);
  const selected65 = selectImagesForCase(row65, 'full');
  const valid65 = {
    imageAnalysis: selected65.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
      imageComplexity: {},
    })),
  };
  assert.equal(assessImageAnalysis(valid65, selected65).semanticAssociationPassed, true);
  const swapped65 = structuredClone(valid65);
  [swapped65.imageAnalysis[2].description, swapped65.imageAnalysis[3].description] = [
    swapped65.imageAnalysis[3].description,
    swapped65.imageAnalysis[2].description,
  ];
  const swapCheck = assessImageAnalysis(swapped65, selected65);
  assert.equal(swapCheck.onePopulatedEntryPerImage, true);
  assert.deepEqual(swapCheck.semanticMismatchedIndexes, [2, 3]);
  assert.equal(swapCheck.semanticAssociationPassed, false);

  const row62 = manifest.cases.find((item) => item.sourceRow === 62);
  const selected62 = selectImagesForCase(row62, 'full');
  const contaminated = {
    imageAnalysis: selected62.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.sourceGalleryIndex === 4
        ? 'Relive the Music - 50s, 60s & 70s Show, October 19 at 7:30 PM.'
        : image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
      imageComplexity: {},
    })),
  };
  const timeCheck = assessImageAnalysis(contaminated, selected62);
  assert.deepEqual(timeCheck.semanticMismatchedIndexes, [4]);
  assert.equal(timeCheck.semanticAssociationPassed, false);
});

test('semantic cue matching tolerates ordinal dates, time punctuation, possessives, and common plurals', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row124 = manifest.cases.find((item) => item.sourceRow === 124);
  const selected124 = selectImagesForCase(row124, 'full');
  const ordinaryMarketDescriptions = [
    'Toby’s Farm Market exterior with a flower.',
    'Rows of pumpkins displayed outdoors.',
    'Pumpkins beside a sign.',
    'Rutabagas and cabbages on a produce display.',
    'A bag of root vegetables, likely parsnips.',
  ];
  const marketResult = {
    imageAnalysis: selected124.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: ordinaryMarketDescriptions[image.sourceGalleryIndex],
      relevanceToPost: 'Describes this source image only.',
    })),
  };
  const marketCheck = assessImageAnalysis(marketResult, selected124);
  assert.equal(marketCheck.semanticAssociationPassed, true);
  assert.deepEqual(marketCheck.semanticMismatchedIndexes, []);

  const swappedMarket = structuredClone(marketResult);
  [swappedMarket.imageAnalysis[1].description, swappedMarket.imageAnalysis[2].description] = [
    swappedMarket.imageAnalysis[2].description,
    swappedMarket.imageAnalysis[1].description,
  ];
  assert.deepEqual(assessImageAnalysis(swappedMarket, selected124).semanticMismatchedIndexes, [1, 2]);

  for (const sourceRow of [329, 343]) {
    const sourceCase = manifest.cases.find((item) => item.sourceRow === sourceRow);
    const selected = selectImagesForCase(sourceCase, 'full');
    const description = sourceRow === 329
      ? 'Pancake brunch fundraiser October 25th, 2026; servings at 9.30 a.m. and 11:30AM.'
      : 'The Arts Guild on October 10th, 2026: restorative healing at 1:00 p.m., then community time.';
    const checked = assessImageAnalysis({
      imageAnalysis: selected.map((image) => ({
        imageIndex: image.sourceGalleryIndex,
        description,
        relevanceToPost: 'Describes this source image only.',
      })),
    }, selected);
    assert.equal(checked.semanticAssociationPassed, true, `source row ${sourceRow}`);
    assert.deepEqual(checked.semanticMismatchedIndexes, [], `source row ${sourceRow}`);
  }
});

test('fixture cue checks use visible image evidence and reject cross-poster swaps', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row65 = manifest.cases.find((item) => item.sourceRow === 65);
  const selected65 = selectImagesForCase(row65, 'full');
  const keyholeDescription = 'Mysteries of the Keyhole House, October 30, at 124 Heather Moyse Dr.';
  const row65Result = {
    imageAnalysis: selected65.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.sourceGalleryIndex === 4 ? keyholeDescription : image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
    })),
  };
  assert.equal(assessImageAnalysis(row65Result, selected65).semanticAssociationPassed, true);
  assert.doesNotMatch(selected65[4].expectedCue, /Harbourfront/i);
  assert.ok(selected65[4].expectedSemanticCueGroups.flat().some((cue) => /124 heather moyse/i.test(cue)));
  const missingPrintedAddress = structuredClone(row65Result);
  missingPrintedAddress.imageAnalysis[4].description = 'Harbourfront Theatre: Mysteries of the Keyhole House, October 30.';
  assert.deepEqual(assessImageAnalysis(missingPrintedAddress, selected65).semanticMismatchedIndexes, [4]);

  const row62 = manifest.cases.find((item) => item.sourceRow === 62);
  const selected62 = selectImagesForCase(row62, 'full');
  const coverDescription = 'Harbourfront Theatre exterior; leaves fall, the curtain rises.';
  const row62Result = {
    imageAnalysis: selected62.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.sourceGalleryIndex === 0
        ? coverDescription
        : image.sourceGalleryIndex === 4
          ? 'Relive the Music 50s, 60s and 70s Show, October 19 at 7:00 PM.'
          : image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
    })),
  };
  assert.equal(assessImageAnalysis(row62Result, selected62).semanticAssociationPassed, true);

  const wrongRow65 = structuredClone(row65Result);
  wrongRow65.imageAnalysis[4].description = 'Relive the Music 50s, 60s and 70s Show, October 19 at 7:00 PM.';
  assert.deepEqual(assessImageAnalysis(wrongRow65, selected65).semanticMismatchedIndexes, [4]);

  const wrongRow62 = structuredClone(row62Result);
  wrongRow62.imageAnalysis[0].description = keyholeDescription;
  assert.deepEqual(assessImageAnalysis(wrongRow62, selected62).semanticMismatchedIndexes, [0]);

  const crossPosterRow62 = structuredClone(row62Result);
  crossPosterRow62.imageAnalysis[4].description = keyholeDescription;
  assert.deepEqual(assessImageAnalysis(crossPosterRow62, selected62).semanticMismatchedIndexes, [4]);

  const row150 = manifest.cases.find((item) => item.sourceRow === 150);
  const dessertImage = row150.images[1];
  assert.equal(dessertImage.expectedSemanticCueGroups[0].includes('dessert'), true);
  assert.equal(dessertImage.expectedSemanticCueGroups[1].includes('drink'), true);
  assert.equal(dessertImage.expectedSemanticCueGroups.flat().some((cue) => /toddy/i.test(cue)), false);
  assert.equal(assessImageAnalysis({
    imageAnalysis: [{
      imageIndex: 1,
      description: 'A dessert slice beside a glass of lemon drink.',
      relevanceToPost: 'A food photo with no printed offer.',
    }],
  }, [dessertImage]).semanticAssociationPassed, true);

  const row212 = manifest.cases.find((item) => item.sourceRow === 212);
  assert.ok(row212.images[0].expectedSemanticCueGroups[2].includes('08 october 2026'));
  assert.equal(assessImageAnalysis({
    imageAnalysis: [{
      imageIndex: 0,
      description: 'Fucked Up with opener Club Rat, 08 OCTOBER 2026.',
      relevanceToPost: 'Names the show and its date.',
    }],
  }, [row212.images[0]]).semanticAssociationPassed, true);

  const row287 = manifest.cases.find((item) => item.sourceRow === 287);
  assert.ok(row287.images[0].expectedSemanticCueGroups.flat().includes('u9 u11'));
  assert.ok(row287.images[0].expectedSemanticCueGroups.flat().includes('u13 u15'));
});

test('dense PowerSkate layout flags are compared, while full date transcription is not required', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row287 = manifest.cases.find((item) => item.sourceRow === 287);
  const selected = selectImagesForCase(row287, 'full');
  const checked = assessImageAnalysis({
    imageAnalysis: [{
      imageIndex: 0,
      description: 'U9-U11 Saturday and U13-U15 Sunday sessions in a two-column table.',
      relevanceToPost: 'The table lists multiple sessions.',
      imageComplexity: {
        hasCalendarGrid: true,
        hasDenseText: true,
        hasMultipleEventListings: true,
        recommendsTiling: true,
      },
    }],
  }, selected);
  assert.equal(checked.expectedLayoutChecks[0].matches, true);
  assert.equal(checked.onePopulatedEntryPerImage, true);
  assert.equal(checked.semanticAssociationPassed, true);
  assert.doesNotMatch(row287.images[0].expectedCue, /October 24|October 31|November 14/);
});

test('image request error and truncated responses expose attempts and mark image fallback inconclusive', async () => {
  const fallbackPayload = validationResult(0, false);
  const imageUrls = [
    'data:image/jpeg;base64,Zm9v',
    'data:image/jpeg;base64,YmFy',
  ];
  const first = fakeClient([
    new Error('mock connection reset'),
    apiResponse(fallbackPayload),
  ]);
  const failedImageRun = await validateContentForStage1Evaluation(
    'No event details.', imageUrls, 'Venue', '2026-10-07', 'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client: first.client }
  );
  assert.equal(failedImageRun.status, 'inconclusive');
  assert.equal(failedImageRun.noImageFallbackUsed, true);
  assert.deepEqual(failedImageRun.attempts.map((attempt) => attempt.requestKind), ['initial', 'no_image_fallback']);
  assert.deepEqual(failedImageRun.attempts.map((attempt) => attempt.imageCount), [2, 0]);
  assert.match(failedImageRun.attempts[1].visibleOutput, /VALIDATION_FAILED/);
  assert.match(getInputText(first.calls[1]), /Has images: true/);

  const truncated = fakeClient([
    apiResponse({}, { status: 'incomplete', output_text: '{"hasValidContent":false,', usage: {
      input_tokens: 500, output_tokens: 2000, total_tokens: 2500,
    } }),
    apiResponse({}, { status: 'incomplete', output_text: '{"hasValidContent":', usage: {
      input_tokens: 500, output_tokens: 4000, total_tokens: 4500,
    } }),
    apiResponse(fallbackPayload),
  ]);
  const truncatedRun = await validateContentForStage1Evaluation(
    'No event details.', imageUrls, 'Venue', '2026-10-07', 'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client: truncated.client }
  );
  assert.equal(truncatedRun.status, 'inconclusive');
  assert.deepEqual(truncatedRun.attempts.map((attempt) => attempt.requestKind), [
    'initial', 'output_limit_retry', 'no_image_fallback',
  ]);
  assert.deepEqual(truncatedRun.attempts.map((attempt) => attempt.status), [
    'incomplete', 'incomplete', 'completed',
  ]);
  assert.equal(truncatedRun.attempts[1].maxOutputTokens, 4000);
  assert.ok(truncatedRun.attempts[0].visibleOutput.length > 0);
});

test('spend preflight stops before transport and the JSONL resume key ignores unfinished records', async () => {
  const budget = new Stage1SpendBudget(0.0001);
  const plan = {
    requestIndex: 1,
    requestKind: 'initial',
    model: 'gpt-5-mini',
    endpoint: 'responses',
    imageCount: 4,
    maxOutputTokens: 2000,
    inputTextChars: 6000,
  };
  assert.throws(() => budget.reserve(plan), Stage1EvaluationBudgetError);
  const tooLarge = estimateRequestCostUsd(plan);
  assert.ok(tooLarge > 0.0001);

  const clientState = fakeClient([]);
  const run = await validateContentForStage1Evaluation(
    'Text', ['data:image/jpeg;base64,Zm9v'], 'Venue', '2026-10-07', 'gpt-5-mini',
    {
      promptVariant: 'production',
      structuredOutput: false,
      client: clientState.client,
      onBeforeRequest: () => { throw new Stage1EvaluationBudgetError('cap reached'); },
      onAttempt: () => {},
    }
  );
  assert.equal(run.status, 'budget_stopped');
  assert.equal(run.result, null);
  assert.equal(run.noImageFallbackUsed, false);
  assert.equal(clientState.calls.length, 0);

  const records = [
    { recordType: 'case_result', caseId: 'a', variantId: 'mini-current', imageSet: 'initial', status: 'completed' },
    { recordType: 'case_result', caseId: 'b', variantId: 'luna-current', imageSet: 'full', status: 'inconclusive' },
    { recordType: 'case_result', caseId: 'c', variantId: 'mini-current', imageSet: 'initial', status: 'request_error' },
    { recordType: 'run_summary' },
  ];
  const keys = getCompletedResumeKeys(records.map((record) => JSON.stringify(record)));
  assert.equal(keys.size, 2);
  assert.equal(keys.has('a\u0000mini-current\u0000initial'), true);
  const variantKeys = getCompletedResumeKeys([JSON.stringify({
    recordType: 'case_result',
    caseId: 'same-case',
    variantId: 'luna-compact-v5',
    imageSet: 'full',
    status: 'completed',
  })]);
  assert.equal(variantKeys.has('same-case\u0000luna-compact-v5\u0000full'), true);
  assert.equal(variantKeys.has('same-case\u0000luna-compact-v5-low\u0000full'), false);
  assert.equal(variantKeys.has('same-case\u0000luna-compact-v5-high\u0000full'), false);
  assert.equal(historicalSpendFromCaseRecords([
    { recordType: 'case_result', requestAttempts: [{ retainedReserveUsd: 0.02 }, { retainedReserveUsd: 0.03 }] },
  ]), 0.05);
  assert.equal(historicalSpendFromOutputRecords([
    { recordType: 'request_attempt', runId: 'new', attemptEventId: 'new:1', attempt: { retainedReserveUsd: 0.02 } },
    { recordType: 'case_result', runId: 'new', requestAttempts: [{ retainedReserveUsd: 0.02 }] },
    { recordType: 'case_result', runId: 'old', requestAttempts: [{ retainedReserveUsd: 0.03 }] },
  ]), 0.05);
});

test('artifact logging failures propagate and never trigger model or no-image fallback', async () => {
  const imageUrls = ['data:image/jpeg;base64,Zm9v', 'data:image/jpeg;base64,YmFy'];
  let reservationAttemptCount = 0;
  const reservationFailureClient = fakeClient([
    apiResponse(validationResult(2)),
    apiResponse(validationResult(0)),
  ]);
  await assert.rejects(
    validateContentForStage1Evaluation(
      'A current event invitation.', imageUrls, 'Venue', '2026-10-08', 'gpt-5-mini',
      {
        promptVariant: 'production',
        structuredOutput: false,
        client: reservationFailureClient.client,
        onBeforeRequest: () => {
          throw Object.assign(new Error('output file busy'), { code: 'EBUSY' });
        },
        onAttempt: () => { reservationAttemptCount++; },
      }
    ),
    (error) => error instanceof Stage1EvaluationArtifactError &&
      error.code === 'STAGE1_EVAL_ARTIFACT_WRITE' && /request reservation logging failed/.test(error.message)
  );
  assert.equal(reservationFailureClient.calls.length, 0);
  assert.equal(reservationAttemptCount, 0);

  let attemptLogCount = 0;
  const attemptFailureClient = fakeClient([apiResponse(validationResult(2))]);
  await assert.rejects(
    validateContentForStage1Evaluation(
      'A current event invitation.', imageUrls, 'Venue', '2026-10-08', 'gpt-5-mini',
      {
        promptVariant: 'production',
        structuredOutput: false,
        client: attemptFailureClient.client,
        onBeforeRequest: () => 'reserved-attempt',
        onAttempt: () => {
          attemptLogCount++;
          throw Object.assign(new Error('attempt file is read-only'), { code: 'EPERM' });
        },
      }
    ),
    (error) => error instanceof Stage1EvaluationArtifactError &&
      error.code === 'STAGE1_EVAL_ARTIFACT_WRITE' && /attempt logging failed/.test(error.message)
  );
  assert.equal(attemptFailureClient.calls.length, 1);
  assert.equal(attemptLogCount, 1);
});

test('JSONL append retries only transient open sharing errors and writes one complete record', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-append-retry-'));
  const outputPath = path.join(tempRoot, 'events.jsonl');
  const originalOpenSync = fs.openSync;
  let openAttempts = 0;
  try {
    fs.openSync = (...args) => {
      openAttempts++;
      if (openAttempts <= 2) throw Object.assign(new Error('transient sharing violation'), { code: 'EBUSY' });
      return originalOpenSync(...args);
    };
    const record = { recordType: 'request_reserved', attemptEventId: 'run:case:variant:1' };
    appendJsonlRecord(outputPath, record);
    assert.equal(openAttempts, 3);
    const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), record);
  } finally {
    fs.openSync = originalOpenSync;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const deniedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-append-denied-'));
  try {
    let deniedOpenAttempts = 0;
    fs.openSync = () => {
      deniedOpenAttempts++;
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    };
    assert.throws(
      () => appendJsonlRecord(path.join(deniedRoot, 'events.jsonl'), { recordType: 'test' }),
      /Could not open JSONL output/,
    );
    assert.equal(deniedOpenAttempts, 1);
  } finally {
    fs.openSync = originalOpenSync;
    fs.rmSync(deniedRoot, { recursive: true, force: true });
  }
});

test('hard spend cap, in-flight reservations, concurrency ceiling, and reservation-first resume accounting', async () => {
  assert.equal(MAX_ESTIMATED_SPEND_USD, 10);
  assert.equal(validateEstimatedSpendLimit(10), 10);
  assert.throws(() => validateEstimatedSpendLimit(10.01), /no more than \$10/);
  assert.equal(validateEvaluationConcurrency(3), 3);
  assert.throws(() => validateEvaluationConcurrency(4), /from 1 to 3/);

  const plan = {
    requestIndex: 1,
    requestKind: 'initial',
    model: 'gpt-5-mini',
    endpoint: 'responses',
    imageCount: 0,
    maxOutputTokens: 2000,
    inputTextChars: 0,
  };
  const oneRequestReserve = estimateRequestCostUsd(plan);
  const budget = new Stage1SpendBudget(oneRequestReserve * 2);
  const reservationA = budget.reserve(plan);
  const reservationB = budget.reserve({ ...plan, requestIndex: 2 });
  assert.equal(budget.describe().inFlightReserveUsd, oneRequestReserve * 2);
  assert.throws(
    () => budget.reserve({ ...plan, requestIndex: 3 }),
    Stage1EvaluationBudgetError,
  );
  budget.settle({
    reservationId: reservationA,
    model: 'gpt-5-mini',
    inputTokens: 1000,
    outputTokens: 100,
  });
  assert.equal(budget.describe().inFlightReserveUsd, oneRequestReserve);
  assert.ok(budget.reservedUsd < oneRequestReserve * 2);
  assert.ok(budget.getReservation(reservationB));

  const started = [];
  let active = 0;
  let maxActive = 0;
  const concurrencyRun = await runWithConcurrency(
    [0, 1, 2, 3, 4, 5],
    3,
    async (item) => {
      started.push(item);
      active++;
      maxActive = Math.max(maxActive, active);
      if (item === 1) {
        await Promise.resolve();
        active--;
        return { status: 'budget_stopped' };
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { status: 'completed' };
    },
    (result) => result.status === 'budget_stopped'
  );
  assert.equal(maxActive, 3);
  assert.deepEqual(started, [0, 1, 2]);
  assert.equal(concurrencyRun.stopped, true);
  assert.equal(concurrencyRun.startedCount, 3);
  assert.equal(concurrencyRun.skippedCount, 3);
  assert.equal(active, 0, 'already-active requests finish before the runner returns');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-reservations-'));
  try {
    const outputPath = path.join(tempRoot, 'resume.jsonl');
    appendJsonlRecord(outputPath, {
      recordType: 'request_reserved',
      attemptEventId: 'run:case:variant:1',
      runId: 'run',
      estimatedReservedUsd: 0.02,
    });
    const reservedRecord = JSON.parse(fs.readFileSync(outputPath, 'utf8').trim());
    assert.equal(historicalSpendFromOutputRecords([reservedRecord]), 0.02);

    appendJsonlRecord(outputPath, {
      recordType: 'request_attempt',
      attemptEventId: 'run:case:variant:1',
      runId: 'run',
      attempt: {
        usageCostEstimateUsd: 0.006,
        retainedReserveUsd: 0.006,
      },
    });
    const completedRecords = fs.readFileSync(outputPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(historicalSpendFromOutputRecords(completedRecords), 0.006);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('cost estimate includes cached input, reasoning output, and conservative GPT-6 cache-write reserve', () => {
  const observedMini = calculateObservedCostUsd({
    model: 'gpt-5-mini', inputTokens: 1000, cachedInputTokens: 200, outputTokens: 300,
  });
  assert.equal(observedMini, 0.000805);
  const observedLuna = calculateObservedCostUsd({
    model: 'gpt-6-luna', inputTokens: 1000, cachedInputTokens: 0, outputTokens: 300,
  });
  assert.equal(observedLuna, 0.000275);
  const lunaPlan = {
    model: 'gpt-6-luna', imageCount: 1, maxOutputTokens: 6000, inputTextChars: 100,
  };
  assert.ok(estimateRequestCostUsd(lunaPlan) > observedLuna);
});

test('runner uses zero hidden retries, a bounded request timeout, and imports no write-capable Firebase client', () => {
  const runnerPath = path.join(functionsRoot, 'scripts', 'stage1-evaluation-runner.mjs');
  const runnerSource = fs.readFileSync(runnerPath, 'utf8');
  const validatorSource = fs.readFileSync(path.join(functionsRoot, 'src', 'parsing', 'contentValidator.ts'), 'utf8');
  assert.match(runnerSource, /maxRetries:\s*0/);
  assert.match(runnerSource, /timeout:\s*60_000/);
  assert.doesNotMatch(runnerSource, /from\s+['"][^'"]*(?:firebase|firestore)/i);
  assert.doesNotMatch(validatorSource, /firebase-admin|firebase-functions|firestore/i);
  assert.deepEqual(getVariants(true).map((variant) => variant.id), [
    'mini-current',
    'mini-compact-structured',
    'luna-current',
    'luna-compact-structured',
  ]);
});
