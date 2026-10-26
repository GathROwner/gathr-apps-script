import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreFamilyFriendly,withFamilyFriendlyScore,FAMILY_FRIENDLY_SCORING_VERSION} from './familyFriendlyScoring.js';

test('Friday Fun swim is a public recreational activity in the stored category',()=>{
  const item={eventName:'Friday Fun swim',category:'Gatherings & Parties',startTime:'12:00',
    familyFriendlyScore:15,familyFriendlyLevel:'unlikely'};
  const before=structuredClone(item),result=withFamilyFriendlyScore(item);
  assert.equal(result.familyFriendlyScore,60);assert.equal(result.familyFriendlyLevel,'likely');
  assert.deepEqual(result.familyFriendlyReasons,['family_activity']);
  assert.equal(result.familyFriendlyScoringVersion,FAMILY_FRIENDLY_SCORING_VERSION);
  assert.deepEqual(item,before);
});

for(const [name,description]of [
  ['Friday Fun swim','Adults only.'],['Friday Fun swim','Private booking only.'],
  ['Friday Fun swim','Lane swim only.'],['Adult Fun Swim','Adult swimming fitness.'],
  ['Fun swim','Restricted to adults.'],['Fun swim','Children are not permitted.'],
  ['Fun swim lessons','Training class.'],
])test('fun swim does not override restrictions: '+name+'/'+description,()=>{
  assert(scoreFamilyFriendly({eventName:name,description,category:'Sports',startTime:'12:00'}).familyFriendlyScore<60);
});

test('a sibling fun swim cannot label a lane session',()=>{
  assert.equal(scoreFamilyFriendly({eventName:'Lane swim',description:'Fitness lanes.',
    contextText:'Friday Fun swim. Children welcome.',category:'Sports',startTime:'12:00'}).familyFriendlyScore,15);
});

for(const [name,startTime,endTime]of [
  ['Lane swim','05:30','07:00'],['Lane swim','07:00','16:00'],['Lane swim','16:00','19:30'],
  ['Leisure pool open','05:30','16:00'],['Leisure pool open','17:30','21:00'],
  ['All pools open','12:30','16:00'],['Waterslide open','18:30','21:00'],
])test('preserves independent pool window: '+name+' '+startTime+'–'+endTime,()=>{
  const item={eventName:name,startTime,endTime,category:'Sports'},before=structuredClone(item),result=withFamilyFriendlyScore(item);
  assert.deepEqual(item,before);assert.equal(result.startTime,startTime);assert.equal(result.endTime,endTime);
  assert.equal(result.familyFriendlyScore,name==='Lane swim'?15:60);
});
