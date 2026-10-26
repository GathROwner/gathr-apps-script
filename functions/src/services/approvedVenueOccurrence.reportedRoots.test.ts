import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyApprovedVenueOccurrence} from './approvedVenueOccurrence.js';
import {buildValidatedVenuePointFields} from './validatedVenuePublication.js';
import {EventData,VenueData} from '../types/index.js';
for(const [id,name,address,title,start,end,source]of [
 ['slug_soulfitpei','Soul Fit PEI','26 Thompson Drive suite D, Charlottetown, PE, Canada','SoulCave Box Fit','09:30','','approved_existing_venue_review'],
 ['slug_steam-pei','STEAM PEI','149 Mt Edward Rd, Charlottetown, PE C1A 5T1, Canada','STEAM PEI World Sustainability Day Event','13:00','15:30','approved_location_review'],
]as const)test('repaired approved root remains the same occurrence: '+name,()=>{
 const venue={id,name,address}as VenueData;
 const old={uniqueId:'reported-root-'+id,eventType:'Gatherings & Parties',venueId:id,eventName:title,name:title,establishment:name,address,startDate:'2026-10-24',endDate:'2026-10-24',startTime:start,endTime:end,isRecurring:'No',recurringPattern:'none',source,locationScope:'city',mapMode:'point',locationReviewStatus:'approved'}as unknown as EventData;
 const fields=buildValidatedVenuePointFields(venue,old);
 const repaired={...old,locationScope:fields.locationScope,locationPrecision:fields.locationPrecision,mapMode:fields.mapMode};
 assert.equal(repaired.locationScope,'venue');assert.equal(repaired.mapMode,'venue');assert.equal(repaired.locationReviewStatus,'approved');
 assert.equal(classifyApprovedVenueOccurrence({...old,locationScope:'venue'},repaired),'match');
 assert.equal(classifyApprovedVenueOccurrence({...old,startTime:'16:00'},repaired),'none');
 assert.equal(classifyApprovedVenueOccurrence({...old,address:'50 Different Road'},repaired),'none');
 assert.equal(classifyApprovedVenueOccurrence(old,{...repaired,locationReviewStatus:'needs_review'}),'none');
 assert.equal(classifyApprovedVenueOccurrence(old,{...repaired,locationScope:'area'}),'none');
});
