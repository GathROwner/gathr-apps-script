import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreFamilyFriendly,FAMILY_FRIENDLY_SCORING_VERSION} from './familyFriendlyScoring.js';
test('public recreational skates qualify without changing adult, sport or movie controls',()=>{
 for(const name of ['Free Skate','Community Freeskate','Public Ice Skate']){
  const result=scoreFamilyFriendly({name,description:'Public recreational skating.',category:'Sports'});
  assert.equal(result.familyFriendlyScore,60);assert(result.familyFriendlyReasons.includes('family_activity'));assert.equal(result.familyFriendlyScoringVersion,FAMILY_FRIENDLY_SCORING_VERSION);
 }
 for(const name of ['Adult Free Skate','Senior Public Skate','Private Community Freeskate','Free Skate Lessons','Hockey Competition','Film: Free Skate'])assert(scoreFamilyFriendly({name,category:'Sports'}).familyFriendlyScore<60,name);
 assert.equal(scoreFamilyFriendly({name:'All pools open',category:'Sports'}).familyFriendlyScore,60);
 assert.equal(scoreFamilyFriendly({name:'Lane swim',category:'Sports'}).familyFriendlyScore,15);
 assert.equal(scoreFamilyFriendly({name:'Family / Public Skate',category:'Sports'}).familyFriendlyScore,85);
});
