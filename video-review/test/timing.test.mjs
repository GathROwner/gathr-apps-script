import test from 'node:test';
import assert from 'node:assert/strict';
import {exactShowinfoPTS} from '../evidence-worker.mjs';
test('rounded showinfo time text never changes exact integer frame identity',()=>{
 const log='[showinfo] config in time_base: 1/30000, frame_rate: 30/1\n[showinfo] n: 0 pts: 692309 pts_time:23.077 duration:1000\n';
 assert.deepEqual(exactShowinfoPTS(log,'1/30000'),[692309]);
 assert.deepEqual(exactShowinfoPTS(log,'2/60000'),[692309]);
});
test('a changed decoder time base fails closed instead of guessing a nearby frame',()=>{
 const log='config in time_base: 1/30000\nn: 0 pts: 100 pts_time:0.00333333';assert.throws(()=>exactShowinfoPTS(log,'1/1000'),/showinfo_time_base_changed/);
});
