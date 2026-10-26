import assert from 'node:assert/strict';
import test from 'node:test';
import {bindFamilyAudienceEvidence, scoreFamilyFriendly} from './familyFriendlyScoring.js';

test('slash skate wording and friends-and-family invitation express family attendance', () => {
  for (const input of [
    {name:'Family/Public Skate — Skate', description:'Activity: Family/Public Skate. Group/opponent: Skate.'},
    {name:'Public / Family Swim'},
    {name:'Artisan Market', description:'Bring your friends and family, enjoy the atmosphere, support small businesses.'},
  ]) {
    const result = scoreFamilyFriendly(input);
    assert.equal(result.familyFriendlyScore, 85);
    assert.deepEqual(result.familyFriendlyReasons, ['explicit_family_audience']);
  }
});

test('children’s programme accepts colon and adjacent yr notation without broad numeric matches', () => {
  for (const description of ['Ages: 4-6yr. Day: Saturdays.', 'Ages:4–6yrs.', 'Ages 4-6 yr.', 'Ages: 4 to 6 years old.']) {
    const result = scoreFamilyFriendly({name:'My First Sports Program', description});
    assert.equal(result.familyFriendlyScore, 80, description);
    assert.deepEqual(result.familyFriendlyReasons, ['child_age_range']);
  }
  for (const description of ['Ages: 40-60yr.', 'Ages: 19-21yr.', 'Size: 4-6yr.', 'Ages: 4-60yr.']) {
    assert.equal(scoreFamilyFriendly({name:'Activity', description}).familyFriendlyScore, 15, description);
  }
});

test('campaign collection and distribution identify beneficiaries without proving child participation', () => {
  for (const description of [
    "Coats for Kids Summerside's annual free winter clothing event. Clothing collected at the listed local collection spots will go to this event.",
    'Free winter clothing distribution for recipients.',
    'Donate coats for children ages 6–12 at the collection depot.',
    'Proceeds support classes for kids. Donations benefit children’s workshops.',
  ]) {
    const result = scoreFamilyFriendly({name:'Coats for Kids Summerside Annual Free Winter Clothing Event', description});
    assert.equal(result.familyFriendlyScore, 15);
    assert(result.familyFriendlyReasons.includes('beneficiary_not_audience'));
    assert(!result.familyFriendlyReasons.includes('child_focused_program'));
  }
});

test('independent child class participation survives beneficiary campaign context and source binding', () => {
  const event = {name:'Coats for Kids Community Workshop'};
  const description = 'A class for kids. Ages: 4-6yr. Proceeds support the clothing campaign.';
  assert(scoreFamilyFriendly({...event, description}).familyFriendlyScore >= 60);
  const familyAudienceEvidence = bindFamilyAudienceEvidence(event, `${event.name}. ${description}`, 'validated_item', 'exact-child-workshop');
  assert(scoreFamilyFriendly({...event, familyAudienceEvidence}).familyFriendlyScore >= 60);
  assert.equal(scoreFamilyFriendly({...event, name:'Separate Adult Workshop', familyAudienceEvidence}).familyFriendlyScore, 0);
});

test('new phrases transfer only through bound item evidence, including a truncated programme description', () => {
  const event = {name:'My First Sports Program', startDate:'2026-10-24', venue:'Civic Centre'};
  const familyAudienceEvidence = bindFamilyAudienceEvidence(event, 'My First Sports Program. Ages: 4-6yr.', 'validated_item', 'exact-sports-source');
  assert.equal(scoreFamilyFriendly({...event, description:'Learn fundamental movement skills.', familyAudienceEvidence}).familyFriendlyScore, 80);
  assert.equal(scoreFamilyFriendly({...event, name:'Adult Fitness', familyAudienceEvidence}).familyFriendlyScore, 15);
  assert.equal(scoreFamilyFriendly({...event, contextText:'Another activity. Ages: 4-6yr.'}).familyFriendlyScore, 15);
});

test('mature restrictions override new phrases while accompanying guardians do not', () => {
  for (const description of ['Bring your friends and family. 19+ event.', 'Family/Public Skate. Mature audiences only.']) {
    assert.equal(scoreFamilyFriendly({name:'Benefit Event', description}).familyFriendlyScore, 0);
  }
  assert.equal(scoreFamilyFriendly({name:'My First Sports Program', description:'Ages: 4-6yr. A parent or guardian (18+) must accompany each child.'}).familyFriendlyScore, 80);
});

test('performer, food and family-brand words remain insufficient attendance evidence', () => {
  for (const input of [
    {name:'Teen Burger Donation Day'},
    {name:'MacMaster Leahy Family', description:'Seven children perform on stage.'},
    {name:'Family / Friends Band', description:'Live music.'},
    {name:'Family Meal Deal', description:'Burger and fries for $5.'},
  ]) assert.equal(scoreFamilyFriendly(input).familyFriendlyScore, 15);
});
