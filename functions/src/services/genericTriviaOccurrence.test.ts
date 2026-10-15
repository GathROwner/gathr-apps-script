import test from 'node:test';import assert from 'node:assert/strict';
import {resolveGenericTriviaOccurrence} from './genericTriviaOccurrence.js';
const owner='https://www.facebook.com/people/Pints-East/61584719147438';
const keeper={id:'keeper',venueId:'pints',category:'Trivia Night',name:'Trivia',startDate:'2026-10-16',startTime:'18:30',endTime:'20:30',description:'With staff host Alex',facebookUrl:owner};
const incoming={...keeper,id:'new',name:'General Trivia',description:'Trivia session hosted by staff member Alex.'};
test('same staff-hosted trivia session has one canonical identity',()=>{
  // Captured production wording includes "staff member" between by and name.
  assert.equal(resolveGenericTriviaOccurrence(incoming,[keeper],owner).kind,'match');
});
test('themes, other hosts, rooms, dates, clocks and publishers remain distinct',()=>{
  for(const change of [{name:'Harry Potter Trivia'},{description:'With staff host Sam'},
    {description:'Trivia night'},{startDate:'2026-10-30'},{startTime:'19:00'},
    {endTime:'22:00'},{additionalLocation:'Upstairs'},{venueId:'other'},
    {facebookUrl:'https://www.facebook.com/aggregator'}])
    assert.equal(resolveGenericTriviaOccurrence({...incoming,...change},[keeper],owner).kind,'none',JSON.stringify(change));
  assert.equal(resolveGenericTriviaOccurrence(incoming,[keeper,{...keeper,id:'other'}],owner).kind,'hold');
});
