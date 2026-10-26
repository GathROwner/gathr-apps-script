import assert from 'node:assert/strict';
import test from 'node:test';
import {selectActivityAudienceBlocks, validFamilyAudienceEvidence, transferFamilyAudienceEvidence} from './familyAudienceEvidence.js';
import {bindFamilyAudienceEvidence, scoreFamilyFriendly, mergeFamilyAudienceEvidence} from '../utils/familyFriendlyScoring.js';

test('separate activity/site blocks and mixed galleries cannot lend their audience', () => {
  const adult = {name:'Drawing for Adults',venue:'Studio'};
  const kids = {name:'Kids Drawing Class',venue:'Studio'};
  const text = 'Drawing for Adults\nAn eight-week course.\n\nKids Drawing Class\nAges 8–11.';
  const adultBlocks = selectActivityAudienceBlocks(adult,[adult,kids],text);
  assert.equal(adultBlocks.length,1);
  assert(!adultBlocks[0].text.includes('8–11'));
  assert.equal(selectActivityAudienceBlocks(adult,[adult,kids],text.replace(/\n\n/g,'\n')).length,0);
  const tour = {name:'Candlelight House Tour',venue:'Historic House'};
  const village = {name:'Village Halloween Day',venue:'Village'};
  const source = 'Candlelight House Tour\nTrue-crime stories.\n\nVillage Halloween Day\nA family-friendly afternoon.';
  const scoped = selectActivityAudienceBlocks(tour,[tour,village],source);
  assert(!scoped.some(block => block.text.includes('family-friendly')));
  assert.equal(scoreFamilyFriendly({...tour,contextText:source}).familyFriendlyScore < 60,true);
});

test('entire programme proof needs explicit scope and no exceptions or multiple sites', () => {
  const item = {name:'Afternoon Craft Station',venue:'Hall'};
  const source = 'This entire afternoon programme welcomes families and is suitable for all ages.';
  assert.equal(selectActivityAudienceBlocks(item,[item],source)[0]?.scope,'whole_programme');
  assert.equal(selectActivityAudienceBlocks(item,[item],source+'\n\nEvening event: 19+.').length,0);
  assert.equal(selectActivityAudienceBlocks(item,[item,{name:'Other',venue:'Other Hall'}],source).length,0);
  assert.equal(selectActivityAudienceBlocks(item,[item],'This festival has family-friendly activities.').length,0);
});

test('one multi-date project retains its explicit all-ages invitation without crossing project identities', () => {
  const project={name:'Blue Ribbon Community Art Project',venue:'Hall'};
  const items=[project,{...project,date:'2026-10-20'}];
  const source='We are hosting the Blue Ribbon Community Art Project. We welcome folks of all ages to be part of this special project!';
  assert.equal(selectActivityAudienceBlocks(project,items,source)[0]?.scope,'whole_programme');
  assert.equal(selectActivityAudienceBlocks(project,[project,{name:'Separate Adult Course',venue:'Hall'}],source).length,0);
  assert.equal(selectActivityAudienceBlocks(project,items,source.replace('this special project','another project')).length,0);
});

test('proof validates shape and can only transfer from its original bound identity', () => {
  const item = {name:'Craft Station',date:'2026-10-17',venue:'Hall'};
  const proof = bindFamilyAudienceEvidence(item,'For families.','validated_item','source');
  const from = {...item,familyAudienceEvidence:proof};
  const to = {name:'Craft Station',startDate:'2026-10-17',venueId:'hall-id'};
  assert(validFamilyAudienceEvidence(from));
  assert(validFamilyAudienceEvidence({...to,familyAudienceEvidence:transferFamilyAudienceEvidence(from,to)}));
  assert.equal(transferFamilyAudienceEvidence({...from,name:'Other'},to),undefined);
  assert.equal(validFamilyAudienceEvidence({...from,familyAudienceEvidence:{...proof,signals:['made-up']}}),undefined);
});

test('merge preserves proven family context without accepting a higher unbound number', () => {
  const item = {name:'Community Concert',startDate:'2026-10-17',venueId:'hall'};
  const old = {...item,familyAudienceEvidence:bindFamilyAudienceEvidence(item,'Family-friendly programme.','reviewed_activity','source')};
  const incoming = {...item,description:'Updated musical programme.',familyFriendlyScore:100};
  const merged = {...old,...incoming};
  const proof = mergeFamilyAudienceEvidence(old,incoming,merged);
  assert(scoreFamilyFriendly({...merged,familyAudienceEvidence:proof}).familyFriendlyScore >= 60);
  const restricted = {...item,description:'19+'};
  const guarded = mergeFamilyAudienceEvidence(old,restricted,merged);
  assert.equal(scoreFamilyFriendly({...merged,familyAudienceEvidence:guarded}).familyFriendlyScore,0);
  assert.equal(mergeFamilyAudienceEvidence(item,incoming,incoming),undefined);
});
