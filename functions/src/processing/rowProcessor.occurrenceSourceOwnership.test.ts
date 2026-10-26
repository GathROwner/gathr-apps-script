import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePostDerivedCityLevelEventLocation,resolveVenueForFullParserEventWithMatcherForRegression,
  fullParserEventLocationCheck} from './rowProcessor.js';
import type {ProcessedEvent} from '../parsing/types.js';
import type {RawRowData} from '../types/index.js';

const row={uniqueId:'ownership-fixture',userName:'Fixture Radio',pageName:'Fixture Radio',timestamp:'2026-10-17T12:00:00Z',mediaUrls:[],
  text:'An island wide food drive across PEI at multiple locations.\nOct. 20 – 12p-4p – Fixture Grocery in Charlottetown\nOct. 22 – 4p-7p – Example Mansion in Kensington'} as RawRowData;
const item={name:'Island Wide Food Drive',description:'Collect food for banks across PEI.',startDate:'2026-10-20',startTime:'12:00',endTime:'16:00',
  establishment:'Fixture Grocery, Charlottetown',additionalLocation:'Fixture Grocery, Charlottetown'} as ProcessedEvent;

test('source-bound visit avoids broad area routing and accepts only exact canonical venue',async()=>{
  assert.equal(resolvePostDerivedCityLevelEventLocation({item,row,establishment:row.userName}),null);
  const venue={id:'fixture-grocery',name:'Fixture Grocery'} as any;
  const params={item,row,rowVenue:{id:'radio',name:'Fixture Radio'} as any,establishment:row.userName,rowIndex:1};
  let calls=0;
  assert.equal(await resolveVenueForFullParserEventWithMatcherForRegression({...params,matcher:async()=>{
    calls++;return {isMatch:true,matchType:'fuzzy',matchedVenue:venue,confidence:90} as any;}}),null);
  assert.ok(calls>0);
  assert.equal(await resolveVenueForFullParserEventWithMatcherForRegression({...params,matcher:async()=>
    ({isMatch:true,matchType:'exact',matchedVenue:venue,confidence:100} as any)}),venue);
});

test('collection-only source role prevents even exact publisher venue or address matches',async()=>{
  const held={...item,sourceLocationRole:'collection_partner_only' as const};
  assert.equal(fullParserEventLocationCheck(held,row).reason,'collection_partner_is_not_event_venue');
  let calls=0;
  assert.equal(await resolveVenueForFullParserEventWithMatcherForRegression({item:held,row,rowVenue:{id:'publisher',name:'Publisher Cafe'} as any,
    establishment:row.userName,rowIndex:1,matcher:async()=>{calls++;return {isMatch:true,matchType:'exact',matchedVenue:{id:'publisher'}} as any;},
    addressMatcher:async()=>{calls++;return {isMatch:true,matchType:'exact',matchedVenue:{id:'publisher'}} as any;}}),null);
  assert.equal(calls,0);
});
