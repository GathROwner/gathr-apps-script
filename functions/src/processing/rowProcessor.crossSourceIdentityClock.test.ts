import assert from 'node:assert/strict';
import test from 'node:test';
import {unresolvedCrossSourceIdentityClockConflict} from './rowProcessor.js';
import type {EventData} from '../types/index.js';

const old={uniqueId:'1739771728156396_calendar',name:'Create: Build The Pride',venueId:'slug_upeisu',startDate:'2026-10-29',startTime:'18:00',endTime:'21:00',recurringPattern:'none',isRecurring:false} as EventData;
const next={...old,uniqueId:'1768889101911325_paint',name:'Create: Paint the Pride',startTime:'17:00',endTime:'19:00',timeFlags:{start:{source:'explicit',evidence:'From5PMto7PM'},end:{source:'explicit',toClose:false,evidence:'From5PMto7PM'}}} as EventData;
test('different source, changed activity title and conflicting explicit clock require identity review before enrichment',()=>{
 assert.equal(unresolvedCrossSourceIdentityClockConflict(old,next),true);
});
test('same identity, same source, another day/venue or unprinted incoming clocks do not trigger this narrow guard',()=>{
 for(const change of [{name:old.name},{uniqueId:old.uniqueId},{startTime:old.startTime},{startDate:'2026-10-30'},{venueId:'another-hall'},{timeFlags:undefined},{recurringPattern:'weekly_thursday',isRecurring:true}])assert.equal(unresolvedCrossSourceIdentityClockConflict(old,{...next,...change} as EventData),false);
});
