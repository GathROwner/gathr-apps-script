import test from 'node:test';import assert from 'node:assert/strict';
import {unknownVenueSourceIdentity} from './rowProcessor.js';
import {resolveQueueCityHint,buildUnrecognizedVenueDocId,pickUnrecognizedVenueDocIdForSource,buildUnrecognizedVenueSample} from '../services/firestoreService.js';
test('two exact source-day school occurrences converge to one city queue and retain trusted ordinary-post source identity',()=>{
 const source=unknownVenueSourceIdentity({uniqueId:'1111111111111',sourceScraperType:'posts'} as any);assert.equal(source,'1111111111111');
 const caption='Explore the Summerside Christmas Craft Trail. Three Oaks High School Annual Craft Fair Saturday9AM–7PM and Sunday9AM–5PM.';
 const cities=['Summerside','Canada'].map(city=>resolveQueueCityHint(city,'Canada',caption));assert.deepEqual(cities,['Summerside','Summerside']);
 const ids=cities.map(city=>buildUnrecognizedVenueDocId('three oaks high school',city,'PE'));assert.equal(ids[0],ids[1]);
 const sample=buildUnrecognizedVenueSample({venueName:'Three Oaks High School',source:'full5stage_event',sourceUniqueId:source,eventDate:'2026-11-14'},'three oaks high school');assert.equal(sample.sourceUniqueId,source);
 const record:any={id:ids[0],establishment:'Three Oaks High School',cityHint:'Summerside',provinceHint:'PE',status:'manual_review',sourceUniqueIds:[source]};
 assert.equal(pickUnrecognizedVenueDocIdForSource([record],'three oaks high school',{cityHint:cities[1],provinceHint:'PE'}),ids[0]);
 assert.equal(pickUnrecognizedVenueDocIdForSource([record],'three oaks high school',{cityHint:'Charlottetown',provinceHint:'PE'}),'');
 assert.equal(pickUnrecognizedVenueDocIdForSource([record],'different high school',{cityHint:'Summerside',provinceHint:'PE'}),'');
 assert.equal(resolveQueueCityHint('Canada',undefined,'Summerside and Charlottetown activities'),undefined);
 assert.equal(unknownVenueSourceIdentity({uniqueId:'model-generated_occurrence_3'} as any),undefined);
});
