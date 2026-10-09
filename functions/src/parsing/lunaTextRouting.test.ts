import test from 'node:test';
import assert from 'node:assert/strict';
import { isCaptionOnlySource, isLunaStage3InputReady } from './lunaTextRouting.js';
import { selectStage1LunaPilot } from './stage1Pilot.js';
import { createCompactV10ValidationPrompt } from './contentValidator.js';
import { captionOnlyActivityExtractionRules } from './eventExtractor.js';

test('caption-only routing is opt-in, source-stable and excludes absent identities', () => {
  assert.equal(selectStage1LunaPilot('dataset', 'post', 0, true, 100, false).selected, false);
  assert.equal(selectStage1LunaPilot('dataset', 'post', 0, true, 100, true).selected, true);
  assert.equal(selectStage1LunaPilot('dataset', 'post', 0, false, 100, true).selected, false);
  assert.equal(selectStage1LunaPilot('dataset', '', 0, true, 100, true).selected, false);
  assert.equal(selectStage1LunaPilot('dataset', 'post', 0, true, 50, true).selected,
    selectStage1LunaPilot('dataset', 'post', 1, true, 50, false).selected);
});

test('source attachments distinguish text-only from unreadable image posts', () => {
  assert.equal(isCaptionOnlySource([], []), true);
  assert.equal(isCaptionOnlySource(['', ' '], []), true);
  assert.equal(isCaptionOnlySource(['https://expired.example/post.jpg'], []), false);
  assert.equal(isCaptionOnlySource([], ['https://example/shared.jpg']), false);
});

test('Stage 3 caption readiness does not weaken image completeness holds', () => {
  const base = { captionOnly: false, allowTextOnly: true, sourceCount: 2,
    preparedCount: 2, galleryCount: 2, maxGalleryCount: 10 };
  assert.equal(isLunaStage3InputReady(base), true);
  assert.equal(isLunaStage3InputReady({ ...base, preparedCount: 1 }), false);
  assert.equal(isLunaStage3InputReady({ ...base, sourceCount: 0, preparedCount: 0 }), false);
  assert.equal(isLunaStage3InputReady({ ...base, galleryCount: 11 }), false);
  assert.equal(isLunaStage3InputReady({ ...base, captionOnly: true, sourceCount: 0, preparedCount: 0 }), true);
  assert.equal(isLunaStage3InputReady({ ...base, captionOnly: true, allowTextOnly: false }), false);
});

test('caption booking clarification preserves the accepted image prompt', () => {
  const caption = 'Sunday October 11th at 1:50pm just opened up! Call Aaron if you would like to book';
  const textPrompt = createCompactV10ValidationPrompt(caption, 0, 'Eastern Kings Sportsplex', '2026-10-08');
  assert.match(textPrompt, /CAPTION-ONLY BOOKING CHECK/);
  assert.match(textPrompt, /do not invent the sport, duration/);
  assert.match(textPrompt, /does not qualify ordinary restaurant table reservations/);
  assert.doesNotMatch(createCompactV10ValidationPrompt(caption, 1, 'Eastern Kings Sportsplex', '2026-10-08'), /CAPTION-ONLY BOOKING CHECK/);
  assert.match(textPrompt, /public care clinic or walk-in clinic/);
  assert.match(captionOnlyActivityExtractionRules(0), /neutral title such as Bookable Time Slot/);
  assert.match(captionOnlyActivityExtractionRules(0), /Do not invent the sport, duration or end time/);
  assert.equal(captionOnlyActivityExtractionRules(1), '');
});
