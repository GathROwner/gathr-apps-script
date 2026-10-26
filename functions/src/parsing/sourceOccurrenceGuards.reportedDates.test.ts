import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDatedPosterOccurrences} from './sourceOccurrenceGuards.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {TimeResolvedEvent} from './types.js';
const event=(overrides:Partial<TimeResolvedEvent>={}):TimeResolvedEvent=>({name:'MAGNA-TILES building adventure',category:'Workshops & Classes',isEvent:'Yes',isFoodSpecial:'No',establishment:'Indigo Charlottetown',startDate:'2026-08-22',endDate:'2026-08-22',startTime:'11:00',endTime:'13:00',isRecurring:'Yes',recurringPattern:'weekly_saturday',timeFlags:{start:{source:'explicit',evidence:'11am'},end:{source:'semantic',toClose:false,evidence:'next grouped start 13:00'}},...overrides} as TimeResolvedEvent);
const indigo='Join us for a fun-filled MAGNA-TILES building adventure inspired by Tumford the Terrible! Each participant will receive a Cat Figure. Saturday August 22\n11am & 1pm (local time). Ages3+.';
test('actual dated Indigo start list stays two nonrecurring starts with unknown ends',()=>{
 const slots=[event(),event({startTime:'13:00',endTime:'15:00',timeFlags:{start:{source:'explicit',evidence:'1pm'},end:{source:'semantic',toClose:false,evidence:'grouped duration default120m'}}})];
 const result=enforceDateTimeCompleteness(slots,'2026-08-09T19:25:00Z','America/Halifax',indigo,true);
 assert.equal(result.length,2);assert.deepEqual(result.map(x=>[x.startTime,x.endTime,x.recurringPattern]),[['11:00','','none'],['13:00','','none']]);
});
test('Holmans Daily masthead and music-series title cannot make August19 daily',()=>{
 const e=event({name:'Songs and Scrabble (Town of Kensington Music Series)',category:'Live Music',startDate:'2026-08-19',endDate:'2026-08-19',startTime:'18:00',endTime:'20:00',recurringPattern:'daily'});
 const [out]=reconcileDatedPosterOccurrences([e],"Both near and far, Holman's is ready for Wednesday! OCR TEXT:2026 WEDNESDAY Holman's Daily Holman's AUGUST19TH".replace('AUGUST19','AUGUST 19'),'2026-08-19');assert.equal(out.recurringPattern,'none');assert.equal(out.endTime,'20:00');
});
for(const cue of ['every Saturday','weekly','Saturdays','daily','each week'])test('preserves explicit cadence '+cue,()=>{const [out]=reconcileDatedPosterOccurrences([event()],indigo+' '+cue,'2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');});
for(const text of ['August22–29','August22 to29','August22 and August29'].map(x=>x.replaceAll('August','August ')))test('does not flatten a source run '+text,()=>{const [out]=reconcileDatedPosterOccurrences([event()],text,'2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');});
test('does not attach another source date to candidate',()=>{const [out]=reconcileDatedPosterOccurrences([event()],indigo.replace('August 22','August 23'),'2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');});
test('repeated caption/OCR mention of one date is still one source date',()=>{const [out]=reconcileDatedPosterOccurrences([event()],indigo+' OCR TEXT:Saturday August22'.replace('August22','August 22'),'2026-08-09');assert.equal(out.recurringPattern,'none');});
test('preserves already bounded finite series outside this repair slice',()=>{const e=event({totalOccurrences:4,recurrenceUntilDate:'2026-09-12'});const [out]=reconcileDatedPosterOccurrences([e],indigo,'2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');assert.equal(out.totalOccurrences,4);});
test('does not flatten shorthand printed occurrence dates',()=>{const [out]=reconcileDatedPosterOccurrences([event()],'August22,23 &24'.replace('August22','August 22'),'2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');});
for(const cue of ['every other Saturday','Biweekly','every 2 weeks','fortnightly','each two weeks','every second Saturday','every weekend','weekends','weekdays'])test('preserves supported interval cadence '+cue,()=>{const [out]=reconcileDatedPosterOccurrences([event({recurringWeekInterval:2})],cue+' starting August 22, 2026','2026-08-09');assert.equal(out.recurringPattern,'weekly_saturday');assert.equal(out.recurringWeekInterval,2);const [withoutInterval]=reconcileDatedPosterOccurrences([event()],cue+' starting August 22, 2026','2026-08-09');assert.equal(withoutInterval.recurringPattern,'weekly_saturday');});
test('one-date guard does not erase an established multiweek interval',()=>{const [out]=reconcileDatedPosterOccurrences([event({recurringWeekInterval:2})],indigo,'2026-08-09');assert.equal(out.recurringWeekInterval,2);assert.equal(out.recurringPattern,'weekly_saturday');});
for(const [source,date]of [
 ['Every third Saturday. Next session October 17, 2026 at 11am.','2026-10-17'],
 ['Every six weeks on Saturday, starting October 24, 2026 at 11am.','2026-10-24'],
 ['Each fifth Saturday, starting October 24, 2026 at 11am.','2026-10-24'],
 ['Every twenty-one days, starting October 24, 2026 at 11am.','2026-10-24'],
])test('dated cleanup preserves explicit cadence without encoding frequency: '+source,()=>{const original=event({startDate:date,endDate:date});delete original.recurringWeekInterval;const [out]=reconcileDatedPosterOccurrences([original],source,'2026-10-01');assert.equal(out.recurringPattern,'weekly_saturday');assert.equal(out.isRecurring,'Yes');assert.equal(out.recurringWeekInterval,undefined);});
