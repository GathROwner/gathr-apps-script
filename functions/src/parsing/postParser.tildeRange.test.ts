import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceDateTimeCompleteness, extractExplicitTimeRangeForRegression} from './postParser.js';
import {TimeResolvedEvent} from './types.js';

const event = (overrides: Partial<TimeResolvedEvent> = {}): TimeResolvedEvent => ({
  name:'Roll with me... — The Van Gogh of Pottery!',
  description:'Open Friday to Sunday 10~5 pm.',
  isEvent:'Yes',isFoodSpecial:'No',category:'Workshops & Classes',
  establishment:'Robert McMillan Pottery',venue:'Robert McMillan Pottery',address:'',
  startDate:'2026-10-23',endDate:'2026-10-23',startTime:'10:00',endTime:'17:00',
  ticketPrice:'',ticketLink:'',relevantImageIndex:0,additionalLocation:'',
  isRecurring:'No',recurringPattern:'none',timeResolution:{hoursUsed:false},
  timeFlags:{start:{source:'explicit',evidence:'10~5 pm'},end:{source:'explicit',toClose:false,evidence:'10~5 pm'}},
  ...overrides,
});
const finish = (items: TimeResolvedEvent[]) => enforceDateTimeCompleteness(
  items,'2026-10-22T08:59:31.000Z','America/Halifax','Open Friday to Sunday 10~5 pm.'
);

test('the three printed pottery sessions keep their supported opening and closing clocks',()=>{
  const input=['2026-10-23','2026-10-24','2026-10-25'].map(date=>event({startDate:date,endDate:date}));
  const before=structuredClone(input),result=finish(input);
  assert.deepEqual(input,before);
  assert.equal(result.length,3);
  for(const [i,x]of result.entries()){
    assert.equal(x.startTime,'10:00');assert.equal(x.endTime,'17:00');
    assert.equal(x.startDate,input[i].startDate);assert.equal(x.endDate,input[i].endDate);
    assert.deepEqual(x.timeFlags,input[i].timeFlags);
  }
  assert.deepEqual(finish(result),result,'offline repeated processing must not change these sessions');
});

test('the same source range recovers a previously collapsed opening clock',()=>{
  const [fixed]=finish([event({startTime:'17:00'})]);
  assert.equal(fixed.startTime,'10:00');assert.equal(fixed.endTime,'17:00');
});

for(const [text,startTime,endTime]of [
  ['10~5pm','10:00','17:00'],['10 ~ 5 pm','10:00','17:00'],
  ['930~11am','09:30','11:00'],['10pm~2am','22:00','02:00'],
  ['8~11pm','20:00','23:00'],['10am–5pm','10:00','17:00'],
  ['between 12:00 pm and 4:00 pm','12:00','16:00'],
])test('reads whole explicit endpoints: '+text,()=>{
  assert.deepEqual(extractExplicitTimeRangeForRegression(text,text),{startTime,endTime});
});

test('a real overnight interval advances its end date once',()=>{
  const [x]=finish([event({description:'Evening music.',category:'Live Music',startTime:'22:00',endTime:'02:00',
    timeFlags:{start:{source:'explicit',evidence:'10pm~2am'},end:{source:'explicit',toClose:false,evidence:'10pm~2am'}}})]);
  assert.equal(x.startTime,'22:00');assert.equal(x.endTime,'02:00');assert.equal(x.endDate,'2026-10-24');
});

test('separate explicit single clocks still recover independently',()=>{
  const [x]=finish([event({description:'Evening concert.',category:'Live Music',startTime:'18:00',endTime:'21:00',
    timeFlags:{start:{source:'explicit',evidence:'7 pm'},end:{source:'explicit',toClose:false,evidence:'9 pm'}}})]);
  assert.equal(x.startTime,'19:00');assert.equal(x.endTime,'21:00');
});

test('a source-supported start with an unadvertised end keeps the end unknown',()=>{
  const [x]=finish([event({description:'Evening concert.',category:'Live Music',startTime:'19:00',endTime:'',
    timeFlags:{start:{source:'explicit',evidence:'7 pm'},end:{source:'none',toClose:false,evidence:'venue_website: named seating approximate end omitted'}}})]);
  assert.equal(x.startTime,'19:00');assert.equal(x.endTime,'');assert.equal(x.endDate,'2026-10-23');
});
