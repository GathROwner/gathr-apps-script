import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';
const venue = {id:'slug_thetivolicinema',name:'The Tivoli Cinema',normalizedName:'the tivoli cinema',address:'155 Kent St',latitude:0,longitude:0} as VenueData;
const tile = 'Tile header shows "Oct 24th (7:00PM)" above "THE EXORCIST".';
function event(p: Record<string, unknown> = {}): EventData {return {uniqueId:'122231172986578108_7656fcd6774e71d7',venueId:venue.id,establishment:venue.name,eventType:'cinema',category:'Cinema',eventName:'The Exorcist',name:'The Exorcist',startDate:'2026-10-24',endDate:'2026-10-24',startTime:'19:30',endTime:'',isEvent:'Yes',isFoodSpecial:'No',isRecurring:'No',recurringPattern:'none',_sourceType:'calendar',description:tile,...p} as unknown as EventData;}
const explicit = (p: Record<string, unknown> = {}) => event({uniqueId:'122233484714578108_3f4a0930e1e2d766',startTime:'19:00',description:'Screening solo October 24 at 7:00PM.',timeFlags:{start:{source:'explicit',evidence:'7:00PM'},end:{source:'none',evidence:''}},...p});
const merge = (a: EventData,b: EventData) => previewDuplicateMerge({existingEvent:a,incomingEvent:b,venue});
test('retained Tivoli hybrid: explicit corroboration corrects start without inventing an end or repainting historical image',()=>{const p=merge(event({image:'historic.webp'}),explicit());assert.equal(p.updates.startTime,'19:00');assert.equal(p.updates.endTime,undefined);assert.equal(p.updates.image,undefined);assert.equal(p.timeImproved,true)});
test('retained first calendar conflict: do not replace description while retaining contradictory clock',()=>{const old=event({description:'Single date/time shown: Oct 24th (7:30PM).'});const p=merge(old,event({uniqueId:'122231172986578108_d919203e18f0895a',startTime:'19:00'}));assert.equal(p.updates.startTime,undefined);assert.equal(p.updates.description,undefined)});
for(const [name,old,inc] of [
 ['explicit existing conflict',event({timeFlags:{start:{source:'explicit',evidence:'7:30PM'}}}),explicit()],
 ['weaker incoming',event(),explicit({timeFlags:{start:{source:'implied',evidence:'7:00PM'}}})],
 ['default hours incoming',event(),explicit({timeResolution:{startFromHours:true}})],
 ['post-time incoming',event(),explicit({timeResolution:{startFromPostTime:true}})],
 ['unmarked incoming',event(),explicit({timeFlags:null})],
 ['doors',event(),explicit({timeFlags:{start:{source:'explicit',evidence:'Doors 7:00PM'}}})],
 ['different date',event(),explicit({startDate:'2026-10-25',endDate:'2026-10-25'})],
 ['double feature',event(),explicit({eventName:'Double Feature: The Exorcist and Exorcist III',name:'Double Feature: The Exorcist and Exorcist III'})],
 ['other film tile',event({description:tile.replace('THE EXORCIST','ELVIRA')}),explicit()],
 ['other date tile',event({description:tile.replace('24th','25th')}),explicit()],
 ['multiple clocks',event({description:tile.replace('7:00PM','7:00PM and 9:00PM')}),explicit()],
 ['two valid showings',event({startTime:'21:00',description:tile.replace('7:00PM','9:00PM')}),explicit()],
 ['range',event({description:tile.replace('7:00PM','7:00PM - 9:00PM')}),explicit()],
 ['different venue',event(),explicit({venueId:'other'})]
] as const) test(name,()=>{assert.equal(merge(old,inc).updates.startTime,undefined)});
import { hasConflictingCinemaClock } from '../utils/occurrenceMergeGuard.js';
test('candidate clock guard allows only corroborated contradiction and preserves distinct showings',()=>{assert.equal(hasConflictingCinemaClock(event(),explicit()),false);assert.equal(hasConflictingCinemaClock(explicit(),event()),false);assert.equal(hasConflictingCinemaClock(explicit(),explicit({startTime:'21:00',timeFlags:{start:{source:'explicit',evidence:'9:00PM'}}})),true)});
test('reverse merge preserves correct explicit19:00 when calendar carries stale19:30',()=>{const p=merge(explicit(),event());assert.equal(p.updates.startTime,undefined);assert.equal(p.updates.timeFlags,undefined)});
test('correcting start does not promote a default or override a source-backed finish',()=>{const p=merge(event({endTime:'21:30',timeResolution:{endFromHours:'duration_default'}}),explicit({endTime:''}));assert.equal(p.updates.startTime,'19:00');assert.equal(p.updates.endTime,undefined);const q=merge(event({endTime:'22:00',timeFlags:{end:{source:'explicit',evidence:'10:00PM'}}}),explicit({endTime:'21:00',timeResolution:{endFromHours:'duration_default'}}));assert.equal(q.updates.endTime,undefined)});
