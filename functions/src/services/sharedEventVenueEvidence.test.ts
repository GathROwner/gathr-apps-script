import assert from 'node:assert/strict';
import test from 'node:test';
import {hasExplicitItemVenueEvidence,sharedEventRequiresOriginalHost} from './sharedEventVenueEvidence.js';
import {rehydrateFormattedEventMetadata} from '../parsing/finalFormatter.js';
import type {RawRowData} from '../types/index.js';
import type {ProcessedEvent,ExtractedItem,FormattedEvent} from '../parsing/types.js';

const row={userName:'Trailside Music Hall',pageName:'TrailsideMusicHall',sharedPostAuthorName:'Promoter',sharedPostAuthorUrl:'https://www.facebook.com/promoter',sharedPostText:'We are bringing our production to PEI.'} as RawRowData;
const proof={kind:'single_location',locations:[{label:'Trailside Music Hall',role:'location',certainty:'confirmed',sourceText:'Trailside Music Hall'}]} as const;
const event={name:'A Night of the Eagles',establishment:'Trailside Music Hall',isFoodSpecial:'No'} as ProcessedEvent;

test('an actual aligned quoted source venue survives formatting and shared-host guard',()=>{
 const source={name:event.name,date:'2026-10-29',startTime:'20:00',endTime:'',venue:'',description:'A live show.',price:'',recurringPattern:'none',extractionReason:'Poster explicitly names venue',spatial:structuredClone(proof)} as ExtractedItem;
 const formatted=rehydrateFormattedEventMetadata({...event,startDate:'2026-10-29'} as FormattedEvent,source);
 assert(hasExplicitItemVenueEvidence(formatted as ProcessedEvent));assert.equal(sharedEventRequiresOriginalHost(formatted as ProcessedEvent,row),false);
 assert.equal(sharedEventRequiresOriginalHost(event,row),true);
});
test('missing quote, copied address, uncertain venue and routes cannot cancel shared-host protection',()=>{
 for(const spatial of [{...proof,locations:[{...proof.locations[0],sourceText:''}]},{...proof,locations:[{...proof.locations[0],certainty:'possible'}]},{...proof,kind:'multi_location'},{...proof,kind:'route'},{...proof,locations:[...proof.locations,...proof.locations]}]){
  const candidate={...event,address:'155 Kent Street',spatial} as ProcessedEvent;assert.equal(hasExplicitItemVenueEvidence(candidate),false);assert.equal(sharedEventRequiresOriginalHost(candidate,row),true);
 }
});

test('formatter-only venue proof cannot cancel shared-host protection',()=>{
 const source={name:event.name,date:'2026-10-29',venue:'',description:'A live show.'} as ExtractedItem;
 for(const original of [source,{...source,spatial:{kind:'unknown' as const,locations:[]}}]){
  const formatted=rehydrateFormattedEventMetadata({...event,startDate:'2026-10-29',spatial:structuredClone(proof)} as FormattedEvent,original);
  assert.equal(hasExplicitItemVenueEvidence(formatted as ProcessedEvent),false);
  assert.equal(sharedEventRequiresOriginalHost(formatted as ProcessedEvent,row),true);
 }
});
test('Saint/St canonical spelling retains exact printed church evidence',()=>{
 const candidate={...event,establishment:'St. Paul\'s Anglican Church, Charlottetown',spatial:{...proof,locations:[{label:'SAINT PAUL\'S ANGLICAN CHURCH',role:'location',certainty:'confirmed',sourceText:'SAINT PAUL\'S ANGLICAN CHURCH'}]}} as ProcessedEvent;
 assert(hasExplicitItemVenueEvidence(candidate));
 assert.equal(hasExplicitItemVenueEvidence({...candidate,establishment:'A different church'}),false);
});
