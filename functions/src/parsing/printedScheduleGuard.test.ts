import test from 'node:test';
import assert from 'node:assert/strict';
import {printedScheduleAnchors, checkPrintedScheduleItem, sharedScheduleSource} from './printedScheduleGuard.js';
import type {ExtractedItem} from './types.js';
const text = 'U9 - (Deadline October 8th)\nOctober 10th- 9:20\nOctober 12th- 9:00\nU11 - (Deadline October 9th)\nOctober 11th- 11:40\nOctober 14th- 4:00\nU13 - (Deadline October 8th)\nOctober 10th- 5:30\nOctober 12th- 5:10';
const item = (date: string, time: string, name='Male U9 Conditioning Session') => ({name,date,startTime:time} as ExtractedItem);
test('independent printed dates reject all six manufactured APM future dates',()=>{
  const anchors=printedScheduleAnchors(text,2026);
  assert.equal(anchors.length,6);
  for(const [group, date,time] of [['U9','2026-10-16','09:20'],['U9','2026-10-23','09:00'],['U11','2026-10-17','11:40'],['U11','2026-10-24','04:00'],['U13','2026-10-16','05:40'],['U13','2026-10-23','05:10']])
    assert.equal(checkPrintedScheduleItem(item(date,time,`Male ${group} Conditioning Session`),anchors),'printed_schedule_date_conflict');
});
test('matching date does not turn a bare clock into a proven morning time',()=>{
  assert.equal(checkPrintedScheduleItem(item('2026-10-14','04:00','Male U11 Conditioning Session'),printedScheduleAnchors(text,2026)),'printed_schedule_meridiem_unresolved');
});
test('healthy explicit clocks pass; different sessions and deadlines cannot support a clock',()=>{
  const anchors=printedScheduleAnchors('U9 - Deadline October 8th\nOctober 16th- 9:20 AM\nU11\nOctober 16th- 5:00 PM',2026);
  assert.equal(checkPrintedScheduleItem(item('2026-10-16','09:20'),anchors),null);
  assert.equal(checkPrintedScheduleItem(item('2026-10-16','17:00'),anchors),'printed_schedule_clock_conflict');
  assert.equal(checkPrintedScheduleItem(item('2026-10-08','09:20'),anchors),'printed_schedule_date_conflict');
});
test('shared source selection does not follow arbitrary nested URLs',()=>{
  assert.equal(sharedScheduleSource('https://external-x.xx.fbcdn.net/emg1/a?url='+encodeURIComponent('https://lh3.googleusercontent.com/image=w1200')), 'https://lh3.googleusercontent.com/image=w1200');
  assert.equal(sharedScheduleSource('https://evil.example/emg1/a?url=https://localhost/x'),null);
});
