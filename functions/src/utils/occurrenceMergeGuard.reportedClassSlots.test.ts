import test from 'node:test';
import assert from 'node:assert/strict';
import {hasConflictingSameSourceClassClock,hasConflictingOccurrenceIdentity} from './occurrenceMergeGuard.js';
const a={uniqueId:'1646743824004162_first',eventName:'MAGNA-TILES building adventure',category:'Workshops & Classes',startDate:'2026-08-22',startTime:'11:00',sourceOccurrenceCount:2,timeFlags:{start:{source:'explicit',evidence:'11am'}}};
const b={...a,uniqueId:'1646743824004162_second',startTime:'13:00',timeFlags:{start:{source:'explicit',evidence:'1pm'}}};
test('actual Indigo two explicit same-source starts cannot enter any broader duplicate fallback',()=>{assert.equal(hasConflictingSameSourceClassClock(a,b),true);assert.equal(hasConflictingOccurrenceIdentity(a,b),true);});
test('same slot is still mergeable',()=>assert.equal(hasConflictingSameSourceClassClock(a,{...b,startTime:'11:00'}),false));
test('single-item time correction retains existing rules',()=>assert.equal(hasConflictingSameSourceClassClock({...a,sourceOccurrenceCount:1},{...b,sourceOccurrenceCount:1}),false));
test('unrelated source and unproven clock do not establish distinct same-source slots',()=>{assert.equal(hasConflictingSameSourceClassClock(a,{...b,uniqueId:'9999999999999_other'}),false);assert.equal(hasConflictingSameSourceClassClock(a,{...b,timeFlags:{start:{source:'semantic',evidence:''}}}),false);});
