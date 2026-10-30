import test from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import {createEvent} from './firestoreService.js';

test('actual Created event log receives explicit file/run/row/source context without storing diagnostic context in public data',async()=>{
  const db=admin.firestore(),originalCollection=db.collection,originalLog=console.log;
  const logs:any[]=[];let written:any;
  (db as any).collection=()=>({doc:()=>({collection:()=>({add:async(value:any)=>{written=value;return {id:'fixture-created'};}})})});
  console.log=(line:any)=>{try{logs.push(JSON.parse(line));}catch{}};
  try{
    const context={fileId:'fixture-file',runId:'fixture-run',rowIndex:251,sourceId:'fictional-source'};
    assert.equal(await createEvent('fixture-venue',{uniqueId:'fictional-source_event',eventName:'Library programme',
      startDate:'2026-11-04',endDate:'2026-11-04',startTime:'10:00',endTime:'',mediaUrls:[]} as any,context),'fixture-created');
    const log=logs.find(entry=>entry.message==='Created event');assert(log);
    assert.deepEqual(log.context,{...context,venueId:'fixture-venue',eventId:'fixture-created'});
    for(const field of Object.keys(context))assert.equal(written[field],undefined);
  }finally{(db as any).collection=originalCollection;console.log=originalLog;}
});
