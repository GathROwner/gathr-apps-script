import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SocialDomainError,
  normalizeCheckInMessage,
  normalizeSocialHandle,
  parseAudience,
  parseCheckInDuration,
  relationshipIdFor,
  validateSocialHandle,
  validateSocialOperationId,
} from './validation.js';

test('normalizeSocialHandle trims, removes @, normalizes width, and lowercases', () => {
  assert.equal(normalizeSocialHandle('  @Craig_123  '), 'craig_123');
  assert.equal(normalizeSocialHandle('＠ＣＲＡＩＧ'), 'craig');
});

test('validateSocialHandle rejects reserved, short, and ambiguous characters', () => {
  assert.throws(() => validateSocialHandle('gathr'), SocialDomainError);
  assert.throws(() => validateSocialHandle('ab'), SocialDomainError);
  assert.throws(() => validateSocialHandle('craig-b'), SocialDomainError);
  assert.equal(validateSocialHandle('craig_b'), 'craig_b');
});

test('relationshipIdFor is stable regardless of member order', () => {
  assert.equal(relationshipIdFor('uid-a', 'uid-b'), relationshipIdFor('uid-b', 'uid-a'));
  assert.notEqual(relationshipIdFor('uid-a', 'uid-b'), relationshipIdFor('uid-a', 'uid-c'));
  assert.throws(() => relationshipIdFor('uid-a', 'uid-a'), SocialDomainError);
});

test('validateSocialOperationId accepts opaque retry tokens and rejects path-like values', () => {
  assert.equal(validateSocialOperationId('m3-test_01'), 'm3-test_01');
  assert.throws(() => validateSocialOperationId('short'), SocialDomainError);
  assert.throws(() => validateSocialOperationId('retry/path'), SocialDomainError);
});

test('normalizeCheckInMessage collapses whitespace and enforces its limit', () => {
  assert.equal(normalizeCheckInMessage('  At   the patio!\n'), 'At the patio!');
  assert.throws(() => normalizeCheckInMessage('x'.repeat(121)), SocialDomainError);
});

test('parseCheckInDuration accepts only the release-one durations', () => {
  assert.equal(parseCheckInDuration(30), 30);
  assert.equal(parseCheckInDuration(60), 60);
  assert.equal(parseCheckInDuration(120), 120);
  assert.throws(() => parseCheckInDuration(45), SocialDomainError);
});

test('parseAudience deduplicates selected friends and rejects empty selections', () => {
  assert.deepEqual(parseAudience('all_friends', ['ignored']), {
    mode: 'all_friends',
    selectedUids: [],
  });
  assert.deepEqual(parseAudience('selected_friends', ['b', 'a', 'b']), {
    mode: 'selected_friends',
    selectedUids: ['a', 'b'],
  });
  assert.throws(() => parseAudience('selected_friends', []), SocialDomainError);
});
