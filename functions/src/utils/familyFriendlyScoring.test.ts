import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAMILY_FRIENDLY_LIKELY_THRESHOLD,
  inferLegacyFamilyFriendlyPrimaryCategory,
  scoreFamilyFriendly,
  withFamilyFriendlyScore,
} from './familyFriendlyScoring.js';

const isLikely = (event: Parameters<typeof scoreFamilyFriendly>[0]): boolean =>
  scoreFamilyFriendly(event).familyFriendlyScore >= FAMILY_FRIENDLY_LIKELY_THRESHOLD;

test('scores explicit family and all-ages evidence as likely', () => {
  assert.equal(isLikely({ name: 'Cloggeroo Family Day' }), true);
  assert.equal(isLikely({ description: 'A high-energy event that is fun for the whole family.' }), true);
  assert.equal(isLikely({ description: 'This concert is suitable for all ages.' }), true);
  assert.equal(isLikely({ description: 'Activités familiales pour tous les âges.' }), true);
});

test('scores child age ranges and child-focused programs as likely', () => {
  assert.equal(isLikely({ name: 'Kids Camp', description: 'Performing Arts Camp for Ages 6-12.' }), true);
  assert.equal(isLikely({ name: 'Read, Sing, Play', description: 'Ages 0-5. Little kids and their grown-ups.' }), true);
  assert.equal(isLikely({ name: 'Rock Art (Kids Club)', description: 'Ages 6-12.' }), true);
  assert.equal(isLikely({ description: "Club de lecture d'été. Activités pour enfants." }), true);
});

test('scores clearly child-targeted activity titles without requiring family wording', () => {
  const kidsTrivia = scoreFamilyFriendly({
    name: 'Kids Trivia',
    description: 'August 26 at 6 PM. Prizes and advance booking available.',
    category: 'Trivia Night',
  });
  assert.equal(kidsTrivia.familyFriendlyScore >= FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(kidsTrivia.familyFriendlyReasons.includes('child_focused_title'), true);

  assert.equal(isLikely({ name: 'Summer Kids Movie Series' }), true);
  assert.equal(isLikely({ name: 'Youth Golf Day', category: 'Sports' }), true);
});

test('scores specific family activities without changing the primary category', () => {
  const scored = scoreFamilyFriendly({
    name: 'Community Celebration',
    description: 'Face painting, a bouncy castle, and a petting zoo.',
    category: 'Gatherings & Parties',
  });
  assert.equal(scored.familyFriendlyScore >= FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(scored.familyFriendlyReasons.includes('family_activity'), true);
});

test('scores family activity formats in English and French', () => {
  assert.equal(isLikely({ name: 'Craft Table' }), true);
  assert.equal(isLikely({ name: 'Jongleur Michael Bergeron' }), true);
  assert.equal(isLikely({ name: 'Échassiers' }), true);
  assert.equal(isLikely({ name: 'Tente découverte de l’Acadie' }), true);
});

test('uses parent source context for split sub-events', () => {
  const scored = scoreFamilyFriendly({
    name: 'Community Concert',
    category: 'Live Music',
    contextText: 'An all-ages afternoon with activities for the whole family.',
  });
  assert.equal(scored.familyFriendlyScore >= FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(scored.familyFriendlyReasons.includes('explicit_all_ages'), true);

  const merchandise = scoreFamilyFriendly({
    name: 'Promotional Item Sale',
    contextText: 'The afternoon also includes face painting and a bouncy castle.',
  });
  assert.equal(merchandise.familyFriendlyScore < FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(merchandise.familyFriendlyReasons.includes('family_activity'), false);
});

test('does not treat isolated family, children, or teen words as audience evidence', () => {
  assert.equal(isLikely({ name: 'MacMaster Leahy Family', description: 'Seven children perform on stage.' }), false);
  assert.equal(isLikely({ name: 'Fishing Derby', description: 'Hosted by Guardians of the Children.' }), false);
  assert.equal(isLikely({ name: 'Teen Burger Donation Day' }), false);
});

test('legacy category is weak evidence rather than an automatic pass', () => {
  const bookSale = scoreFamilyFriendly({
    name: 'Friends of the Library Book Sale',
    category: 'Family Friendly',
  });
  assert.equal(bookSale.familyFriendlyScore < FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(bookSale.familyFriendlyReasons.includes('legacy_family_category'), true);
});

test('hard adult restrictions override positive family wording', () => {
  const scored = scoreFamilyFriendly({
    name: 'Family Friendly Comedy Night',
    description: 'Adults only after dark.',
    ageRestriction: '19+',
  });
  assert.equal(scored.familyFriendlyScore, 0);
  assert.equal(scored.familyFriendlyLevel, 'unlikely');
  assert.equal(scored.familyFriendlyReasons.includes('adult_age_restriction'), true);
});

test('adult entertainment is excluded even when no age field is populated', () => {
  const scored = scoreFamilyFriendly({ name: "Europe's #1 Male Revue" });
  assert.equal(scored.familyFriendlyScore, 0);
  assert.equal(scored.familyFriendlyReasons.includes('adult_entertainment'), true);
});

test('explicit all-ages evidence survives a modest alcohol-context penalty', () => {
  const scored = scoreFamilyFriendly({
    name: 'Arkells at PEI Brewing Company',
    description: 'All ages. General admission.',
    startTime: '20:00',
  });
  assert.equal(scored.familyFriendlyScore >= FAMILY_FRIENDLY_LIKELY_THRESHOLD, true);
  assert.equal(scored.familyFriendlyReasons.includes('alcohol_focused'), true);
});

test('late time is a supporting penalty, not an unsupported positive signal', () => {
  const scored = scoreFamilyFriendly({ name: 'Late Night Social', startTime: '22:30' });
  assert.equal(scored.familyFriendlyScore, 0);
  assert.equal(scored.familyFriendlyReasons.includes('very_late_start'), true);
});

test('scores are deterministic and versioned', () => {
  const event = { name: 'Trucks for Kids', description: 'A touch-a-truck event for kids.' };
  assert.deepEqual(scoreFamilyFriendly(event), scoreFamilyFriendly(event));
  assert.equal(scoreFamilyFriendly(event).familyFriendlyScoringVersion, 'family-friendly-v4');
});

test('central write scoring preserves a current contextual score', () => {
  const contextual = scoreFamilyFriendly({
    name: 'Main Stage Performance',
    contextText: 'All ages are welcome.',
  });
  const preserved = withFamilyFriendlyScore({
    name: 'Main Stage Performance',
    ...contextual,
  });
  assert.deepEqual(preserved, { name: 'Main Stage Performance', ...contextual });
});

test('legacy family category migration preserves the actual event type', () => {
  assert.equal(
    inferLegacyFamilyFriendlyPrimaryCategory({ name: 'Toddler Tunesdays', description: 'Music and movement.' }),
    'Live Music'
  );
  assert.equal(
    inferLegacyFamilyFriendlyPrimaryCategory({ name: 'Indigenous Youth Golf Day' }),
    'Sports'
  );
  assert.equal(
    inferLegacyFamilyFriendlyPrimaryCategory({ name: 'Kids Camp', description: 'Performing arts camp.' }),
    'Workshops & Classes'
  );
  assert.equal(
    inferLegacyFamilyFriendlyPrimaryCategory({ name: 'Friends of the Library Book Sale' }),
    'Gatherings & Parties'
  );
});
