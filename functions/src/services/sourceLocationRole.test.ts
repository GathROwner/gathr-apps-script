import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateSampleTopLevelUrls} from './unknownVenueResolver.js';
import type {UnrecognizedVenueRecord, UnrecognizedVenueSampleEvent} from '../types/index.js';
const original: UnrecognizedVenueSampleEvent={source:'full5stage_event',fileId:'fixture-file',rowIndex:29,
  sourceLocationRole:'shared_original_business',aggregatorName:'Fixture Dairy Bar',aggregatorFacebookUrl:'https://www.facebook.com/FixtureDairyBar',
  topLevelUrl:'https://www.facebook.com/FixtureDairyBar/posts/2222222222',observedVenueName:'Fixture Dairy Bar'};
const record=(samples: UnrecognizedVenueSampleEvent[]): UnrecognizedVenueRecord=>({id:'uv_fixture',establishment:'Fixture Dairy Bar',
  establishmentNormalized:'fixture dairy bar',status:'manual_review',occurrences:samples.length,sampleEvents:samples});

test('original-business reviews never read outer publisher rows or write address backfills',async()=>{
  const input=record([original]);
  const result=await hydrateSampleTopLevelUrls(input,async()=>{throw new Error('Unexpected publisher dataset read');},
    async()=>{throw new Error('Unexpected persistence');});
  assert.equal(result,input);assert.equal(result.sampleEvents?.[0].aggregatorAddress,undefined);
});

test('mixed-sample hydration preserves original-business evidence while ordinary backfill still works',async()=>{
  const legacy: UnrecognizedVenueSampleEvent={source:'full5stage_event',fileId:'fixture-file',rowIndex:0,sourceUniqueId:'legacy-post',observedVenueName:'Fixture Hall'};
  let reads=0,writes=0;
  const result=await hydrateSampleTopLevelUrls(record([original,legacy]),async()=>{
    reads++;return {rows:[{uniqueId:'legacy-post',address:'17 Publisher St',topLevelUrl:'https://www.facebook.com/FixtureFoodies/posts/1234567890'}]} as any;
  },async(id,samples)=>{
    writes++;assert.equal(id,'uv_fixture');assert.deepEqual(samples[0],original);assert.equal(samples[1].aggregatorAddress,'17 Publisher St');
  });
  assert.equal(reads,1);assert.equal(writes,1);assert.deepEqual(result.sampleEvents?.[0],original);
  assert.equal(result.sampleEvents?.[1].aggregatorAddress,'17 Publisher St');
});
