import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventData} from '../types/index.js';
import {hasConflictingProgrammeSlot, hasMatchingLabeledSlotTimeEvidence} from './eventSlotIdentity.js';
import {isDuplicateEntry, isHighConfidenceSameOccurrenceDuplicate} from './similarity.js';
import {shouldSkipSiblingUniqueIdDuplicateCheck} from '../services/firestoreService.js';
import {isExactUniqueIdDuplicateCompatible} from '../services/exactUniqueIdCompatibility.js';
import {previewDuplicateMerge} from '../processing/rowProcessor.js';

const skating = (name: string, endTime: string): EventData => ({
  uniqueId: '1733964295400114_1', venueId: 'fixture', establishment: 'Cavendish Farms Community Events Centre',
  name, eventName: name, startDate: '2026-10-17', endDate: '2026-10-17',
  startTime: name.includes('Can') ? '12:15' : '13:15', endTime,
  category: 'Sports', recurringPattern: 'none', isRecurring: 'No',
} as EventData);
const merge = (existingEvent: EventData, incomingEvent: EventData) => previewDuplicateMerge({
  existingEvent, incomingEvent,
  venue:{id:'fixture',name:existingEvent.establishment,normalizedName:'fixture',address:'fixture',latitude:0,longitude:0},
});

test('Oct17 distinct overlapping skating programmes survive every duplicate entry path', () => {
  const pairs = [
    [skating('Figure Skating — PreCan', '12:45'), skating('Figure Skating — CanSkate', '13:00')],
    [skating('Figure Skating — Stage 5-6', '14:00'), skating('Figure Skating — Star 1-2', '14:15')],
  ];
  for (const [a,b] of pairs) for (const [left,right] of [[a,b],[b,a]]) {
    assert.equal(isDuplicateEntry(left,right), false);
    assert.equal(isHighConfidenceSameOccurrenceDuplicate(left,right), false);
    assert.equal(hasConflictingProgrammeSlot(left,right), true);
    assert.equal(isExactUniqueIdDuplicateCompatible(left,right), false);
    assert.deepEqual(merge(left,right).changedFields, []);
    assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(left,{...right,uniqueId:'1733964295400114_2'}),true);
  }
});

const art = (group: number, startTime: string, endTime: string, evidence: string): EventData => ({
  uniqueId: `1586777749908244_${group}`, venueId: 'fixture', establishment: 'Eptek Art & Culture Centre',
  name: `Let's Get Creative Art Club @ Eptek – Fall 2026 (Group ${group})`,
  startDate: '2026-10-18', endDate: '2026-10-18', startTime, endTime,
  category: 'Workshops & Classes', recurringPattern:'weekly_sunday',isRecurring:'Yes',totalOccurrences:8,
  timeFlags:{start:{source:'explicit',evidence},end:{source:'explicit',evidence:endTime==='13:45'?'1:45':'3:30'}},
} as EventData);

test('Oct17 Eptek generic cross-post slots use both endpoints of range-only 12-hour evidence', () => {
  const groups = [art(1,'12:30','13:45','12:30 – 1:45'),art(2,'14:15','15:30','2:15 – 3:30')];
  for (const [index,group] of groups.entries()) {
    const evidence=index===0?'12:30 - 1:45':'2:15 - 3:30';
    const incoming={...group,uniqueId:'1629374475648571_1',name:'Let’s Get Creative Kid’s Art Club',
      timeFlags:{start:{source:'explicit',evidence},end:{source:'explicit',evidence}}} as EventData;
    const wrong=groups[1-index];
    assert.equal(hasMatchingLabeledSlotTimeEvidence(incoming,group),true);
    assert.equal(isDuplicateEntry(incoming,group),true);
    for (const [left,right] of [[incoming,wrong],[wrong,incoming]]) {
      assert.equal(isDuplicateEntry(left,right),false);
      assert.equal(isHighConfidenceSameOccurrenceDuplicate(left,right),false);
      assert.equal(isExactUniqueIdDuplicateCompatible(left,right),false);
      assert.deepEqual(merge(left,right).changedFields,[]);
    }
    assert.equal(hasMatchingLabeledSlotTimeEvidence({...incoming,timeFlags:undefined},group),false);
  }
});

test('genuine programme cross-posts and overlapping corrected clocks remain mergeable', () => {
  const a=skating('Figure Skating — CanSkate','13:00');
  const crossPost={...a,uniqueId:'another_1'};
  assert.equal(isDuplicateEntry(a,crossPost),true);
  assert.equal(isHighConfidenceSameOccurrenceDuplicate(a,{...a}),true);
  const corrected={...a,startTime:'12:20'};
  assert.equal(isDuplicateEntry(a,corrected),true);
  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(a,{...corrected,uniqueId:'1733964295400114_2'}),false);
});
