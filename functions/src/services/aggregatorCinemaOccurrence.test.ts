import test from 'node:test';import assert from 'node:assert/strict';
import {resolveAggregatorCinemaOccurrence} from './aggregatorCinemaOccurrence.js';
const aggregator='https://www.facebook.com/DowntownCharlottetownInc',owner='https://www.facebook.com/thetivolicinema';
const film={id:'keeper',category:'Cinema',name:'Jim Queen',startDate:'2026-10-15',startTime:'21:30',facebookUrl:owner};
test('aggregator Jim Queen wrong time holds without changing the official screening',()=>{
  assert.equal(resolveAggregatorCinemaOccurrence({...film,id:'incoming',name:'ANCHOR Fest Jim Queen',startTime:'21:00',facebookUrl:aggregator},[film],owner).kind,'hold');
  assert.equal(film.startTime,'21:30');
});
test('same-time renamed aggregator uses the existing occurrence',()=>{
  assert.equal(resolveAggregatorCinemaOccurrence({...film,name:'ANCHOR Fest Jim Queen',facebookUrl:aggregator},[film],owner).existing?.id,'keeper');
});
test('first-party additional screenings, other dates and films remain independent',()=>{
  for(const incoming of [{...film,startTime:'21:00'},{...film,facebookUrl:aggregator,startDate:'2026-10-16'},
    {...film,facebookUrl:aggregator,name:'Captain Newfoundland'}])
    assert.equal(resolveAggregatorCinemaOccurrence(incoming,[film],owner).kind,'none');
});

test('Pressure Points programme prefix variation and three-hour conflict still hold',()=>{
  const original={...film,name:'Shorts Program: Pressure Points',startDate:'2026-10-16',startTime:'18:00'};
  const incoming={...original,name:'ANCHOR Fest Short Program, Pressure Points',facebookUrl:aggregator,startTime:'21:00'};
  assert.equal(resolveAggregatorCinemaOccurrence(incoming,[original],owner).kind,'hold');
  assert.equal(resolveAggregatorCinemaOccurrence({...incoming,startTime:'18:00'},[original],owner).kind,'match');
  assert.equal(resolveAggregatorCinemaOccurrence({...incoming,facebookUrl:owner},[original],owner).kind,'none');
});
