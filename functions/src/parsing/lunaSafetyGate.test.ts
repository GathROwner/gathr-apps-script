import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHoldUndatedStandingSchedule, shouldRetrySeasonalLeagueWithLegacy,
  isSelectedLunaCanaryPost, isSampledLunaCanaryPost,
  canRetryLunaCanaryWithLegacy, canaryGeneratedCleanupUrls,
  hasMalformedLunaEventTitle, isOnlineAdministrativeMilestone } from './lunaSafetyGate.js';
import { normalizeCommunityMealEvent } from './finalFormatter.js';
import type { ExtractedItem, FormattedEvent } from './types.js';

test('holds an undated standing weekday board but preserves dated and this-week schedules', () => {
  assert.equal(shouldHoldUndatedStandingSchedule(
    'The Factory week at a glance: standing weekly schedule. Tue to Sat.'), true);
  assert.equal(shouldHoldUndatedStandingSchedule(
    'Week at a glance for this week: Tue to Sat.'), false);
  assert.equal(shouldHoldUndatedStandingSchedule(
    'Weekly lineup September 29 through October 3.'), false);
  assert.equal(shouldHoldUndatedStandingSchedule(
    'Sounds of the Waterfront July 6-12 at two stages.'), false);
});

test('Luna canary matches only an enabled, exact post ID in a bounded list', () => {
  assert.equal(isSelectedLunaCanaryPost('post-1', true, 'post-1,post-2'), true);
  assert.equal(isSelectedLunaCanaryPost('post-3', true, 'post-1,post-2'), false);
  assert.equal(isSelectedLunaCanaryPost('post-1', false, 'post-1'), false);
  assert.equal(isSelectedLunaCanaryPost('post-1', true, '*'), false);
  assert.equal(isSelectedLunaCanaryPost('post-1', true, Array(9).fill('post-1').join(',')), false);
});

test('legacy retry keeps the complete source gallery and tiles the intended image', () => {
  assert.equal(canRetryLunaCanaryWithLegacy(1, [0]), true);
  assert.equal(canRetryLunaCanaryWithLegacy(4, [0]), true);
  assert.equal(canRetryLunaCanaryWithLegacy(4, []), true);
  assert.equal(canRetryLunaCanaryWithLegacy(4, [1]), false);
  assert.equal(canRetryLunaCanaryWithLegacy(4, [0, 1]), false);
  assert.equal(canRetryLunaCanaryWithLegacy(5, []), false);
  assert.equal(canRetryLunaCanaryWithLegacy(0, []), false);
  assert.equal(canRetryLunaCanaryWithLegacy(1, null), false);
});

test('canary cleanup excludes managed source gallery and profile images', () => {
  const source = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/source.jpg';
  const profile = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/profile.jpg';
  const analysis = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/ocr-base.webp';
  assert.deepEqual(canaryGeneratedCleanupUrls([source, analysis, profile], [source, profile]),
    [analysis]);
});

test('Luna sample is stable, bounded, and can exclude a reviewed post', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `post-${i}`);
  const selected = ids.filter(id => isSampledLunaCanaryPost(id, true, '15'));
  assert.ok(selected.length >= 15 && selected.length <= 45);
  assert.deepEqual(selected, ids.filter(id => isSampledLunaCanaryPost(id, true, '15')));
  assert.equal(isSampledLunaCanaryPost(selected[0], true, '15', selected[0]), false);
  assert.equal(isSampledLunaCanaryPost(selected[0], false, '15'), false);
  assert.equal(isSampledLunaCanaryPost(selected[0], true, '21'), false);
  assert.equal(isSampledLunaCanaryPost(selected[0], true, '*'), false);
});

test('seasonal league timetable uses the reviewed legacy route until recurrence is defined', () => {
  assert.equal(shouldRetrySeasonalLeagueWithLegacy(
    'The Regular Season will officially begin the week of November 2, 2026. The schedule is below. New this year is a daytime regular league on Wednesdays.'), true);
  assert.equal(shouldRetrySeasonalLeagueWithLegacy(
    'The festival begins November 2. See the stage schedule below.'), false);
  assert.equal(shouldRetrySeasonalLeagueWithLegacy(
    'The curling league meets November 2 for a one-day tournament.'), false);
  assert.equal(shouldRetrySeasonalLeagueWithLegacy(
    'The Regular Season will officially begin the week of November 2, 2026. The schedule is below. New daytime regular league. Learn to Curl starts November 12 for 6 weeks.'), true);
});

test('Luna prose title falls back while genuine multi-part performance names remain usable', () => {
  assert.equal(hasMalformedLunaEventTitle([{ name:
    'October 17th 1- and October 25th 3- with a BBQ. You will have a chance to register in person, sign up for leagues, meet board members, pick up some pro shop items, and check out the club!' }]), true);
  assert.equal(hasMalformedLunaEventTitle([{ name:
    'Celtic Christmas at Red Shores (Live Entertainment with The Ross Family)' }]), false);
  assert.equal(hasMalformedLunaEventTitle([{ name:
    'SOFT INTERNET THEORY Exhibition Opening' }]), false);
});

test('online election milestones without a gathering place are held, but public events survive', () => {
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'UPEISU Elections: Voting Starts', description: 'Voting starts via myupei.ca.',
    spatial: { locations: [], evidenceNotes: 'No physical venue is shown.' },
  }), true);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'UPEISU Elections: Voting Starts', description: 'Voting starts via myupei.ca.',
    spatial: { kind: 'online', locations: ['myupei.ca'], evidenceNotes: 'No physical venue is listed.' },
  }), true);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'UPEISU Elections: Voting Starts', description: 'Voting starts via myupei.ca.',
    venue: 'myupei.ca', additionalLocation: 'myupei.ca',
    spatial: { kind: 'single_location', locations: ['myupei.ca'], evidenceNotes: 'The online voting site is printed.' },
  }), true);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'UPEISU Elections', description: 'Voting opens at 8 AM via myupei.ca.',
    venue: 'myupei.ca', spatial: { kind: 'single_location', locations: ['myupei.ca'] },
  }), true);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'UPEISU Elections: Voting Ends', description: 'Results announced on social media.',
    spatial: { locations: [], evidenceNotes: 'No physical venue is shown.' },
  }), true);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'Election Night Watch Party', description: 'Watch results together at 8 PM.',
    venue: 'The Fox & Crow',
  }), false);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'Voter Registration Workshop', description: 'Join online via Zoom at 7 PM.',
  }), false);
  assert.equal(isOnlineAdministrativeMilestone({
    name: 'Registration Opens', description: 'At the student centre from 6 PM.',
    additionalLocation: 'Student Centre',
  }), false);
});

test('scheduled community lunch remains an event and gets no invented end', () => {
  const source = { endTime: '', timeFlags: { end: { source: 'none' } } } as ExtractedItem;
  const event = {
    name: 'Senior’s Lunch',
    description: 'Meet other seniors and learn about Town programs. Sponsored by Mary’s Cornwall Bakery.',
    category: 'Food Special', isEvent: 'No', isFoodSpecial: 'Yes',
    startTime: '11:30', endTime: '21:00',
  } as FormattedEvent;
  const normalized = normalizeCommunityMealEvent(event, source);
  assert.equal(normalized.category, 'Gatherings & Parties');
  assert.equal(normalized.isEvent, 'Yes');
  assert.equal(normalized.isFoodSpecial, 'No');
  assert.equal(normalized.endTime, '');
});

test('priced lunch deal and printed end time are preserved', () => {
  const deal = { name: 'Senior Lunch Special', description: 'Half-price lunch for seniors.',
    category: 'Food Special', endTime: '20:00' } as FormattedEvent;
  assert.equal(normalizeCommunityMealEvent(deal).category, 'Food Special');
  assert.equal(normalizeCommunityMealEvent(deal).endTime, '20:00');
  const gathering = { name: 'Community Dinner', description: 'Meet neighbours and register for programs.',
    category: 'Food Special', endTime: '20:00' } as FormattedEvent;
  const source = { endTime: '20:00', timeFlags: { end: { source: 'explicit' } } } as ExtractedItem;
  assert.equal(normalizeCommunityMealEvent(gathering, source).endTime, '20:00');
});
