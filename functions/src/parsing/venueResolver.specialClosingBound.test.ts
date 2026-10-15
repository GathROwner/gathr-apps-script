import test from 'node:test';import assert from 'node:assert/strict';
import {boundSpecialCategoryEnd,resolveTimesWithOperatingHours} from './venueResolver.js';
import * as firestore from '../services/firestoreService.js';
const daytime={open:'07:00',close:'20:00'};
test('untimed food-special category cutoff cannot outlast verified closing',()=>{
  assert.equal(boundSpecialCategoryEnd('07:00','21:00','Food Special',daytime),'20:00');
  assert.equal(boundSpecialCategoryEnd('16:00','19:00','Happy Hour',daytime),'19:00');
});
test('overnight hours use the occurrence span rather than clock-string order',()=>{
  assert.equal(boundSpecialCategoryEnd('19:00','23:00','Food Special',{open:'18:00',close:'02:00'}),'23:00');
  assert.equal(boundSpecialCategoryEnd('00:30','04:00','Drink Special',{open:'18:00',close:'02:00'}),'02:00');
});
test('unverified hours, other activities and explicit outside-hours starts retain their policy',()=>{
  assert.equal(boundSpecialCategoryEnd('19:00','23:00','Live Music',daytime),'23:00');
  assert.equal(boundSpecialCategoryEnd('23:00','01:00','Food Special',daytime),'01:00');
  assert.equal(boundSpecialCategoryEnd('07:00','21:00','Food Special',{open:'',close:'20:00'}),'21:00');
  assert.equal(boundSpecialCategoryEnd('07:00','21:00','Food Special',{...daytime,closed:true}),'21:00');
});
test('normal resolver preserves explicit and all-day ends while bounding only category fallback',async t=>{
  t.mock.method(firestore,'findVenueByName',async()=>({id:'fixture',name:'Fixture Venue',operatingHoursUpdatedAt:Date.now(),operatingHours:{thursday:daytime}} as any));
  const base:any={name:'Thursday food offer',category:'Food Special',isEvent:'No',isFoodSpecial:'Yes',establishment:'Fixture Venue',startDate:'2026-10-15',endDate:'2026-10-15',startTime:'',endTime:'',recurringPattern:'weekly_thursday',timeFlags:{start:{source:'none',evidence:''},end:{toClose:false,evidence:''}}};
  const results=await resolveTimesWithOperatingHours([base,{...base,name:'All-day fish offer',timeFlags:{...base.timeFlags,end:{toClose:true,evidence:'All day'}}},{...base,name:'Printed dinner service',startTime:'18:00',endTime:'22:00'}],'Fixture Venue','','2026-10-14T14:39:34Z');
  assert.equal(results[0].endTime,'20:00');assert.equal(results[0].timeResolution?.endFromHours,'category_default');
  assert.equal(results[0].timeResolution?.reason,'category_default_bounded_by_venue_close');
  assert.equal(results[1].endTime,'20:00');assert.equal(results[1].timeResolution?.endFromHours,'to_close');
  assert.equal(results[2].endTime,'22:00');
});
