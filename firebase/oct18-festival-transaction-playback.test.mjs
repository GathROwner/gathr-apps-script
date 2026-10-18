// Actual write-mode worker, saved source inventory, in-memory atomic transactions.
// No production connection, network or paid evidence generation is available.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import {createRequire} from 'node:module';
import {FrozenDatabase} from './oct18-frozen-database.mjs';
const require=createRequire(new URL('../functions/artifacts/oct18-audit-fixes/festival-followup-release/assembly/package.json',import.meta.url));
const {FieldValue}=require('firebase-admin/firestore');
const candidate=require('./lib/services/festivalLinkWorker.js').runFestivalLinkWorker;
const previous=createRequire(new URL('../functions/artifacts/oct18-audit-fixes/festival-release/assembly/package.json',import.meta.url))('./lib/services/festivalLinkWorker.js').runFestivalLinkWorker;
const inventory=JSON.parse(await fs.readFile(new URL('../functions/artifacts/oct18-audit-fixes/festival-proposed-inventory.json',import.meta.url),'utf8'));
globalThis.fetch=async()=>{throw Error('Network forbidden in transaction playback');};
const file='1Nwf4lh-reDH0alm37Lvkqu61Shv_mwer',parent='events/area_7ebb4bc0846d26c4470e6842';
const options={mode:'publish',asOf:'2026-10-18',fileId:file};
class TransactionDatabase extends FrozenDatabase {
 constructor(){super(inventory.entries);this.commits=0;this.transactions=0;this.entries.set('runtime_metadata/event_feed',{path:'runtime_metadata/event_feed',data:{version:314}});}
 serial(value){if(value instanceof FieldValue)return{_seconds:1792344000,_nanoseconds:this.commits*1e6};if(Array.isArray(value))return value.map(v=>this.serial(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>{assert.notEqual(v,undefined,'Firestore rejects undefined');return[k,this.serial(v)];}));return value;}
 async runTransaction(callback){this.transactions++;if(this.beforeTransaction)this.beforeTransaction(this.transactions);const pending=[];
  const tx={get:async ref=>ref.path?this.snapshot(ref.path):ref.get(),getAll:async(...refs)=>this.getAll(...refs),set:(ref,data)=>pending.push({path:ref.path,kind:'set',data}),update:(ref,data)=>pending.push({path:ref.path,kind:'update',data}),create:(ref,data)=>pending.push({path:ref.path,kind:'create',data}),delete:ref=>pending.push({path:ref.path,kind:'delete'})};
  const result=await callback(tx);this.commits++;
  for(const op of pending){const existing=this.entries.get(op.path);if(op.kind==='update')assert(existing);if(op.kind==='create')assert(!existing);if(op.kind==='delete')this.entries.delete(op.path);else this.entries.set(op.path,{path:op.path,data:op.kind==='update'?{...existing.data,...this.serial(op.data)}:this.serial(op.data),version:{seconds:1792344000,nanoseconds:this.commits*1e6}});this.writes.push({path:op.path,kind:op.kind});}
  return result;
 }
}
test('previous exact serving worker reproduces its own-parent canonical drift after first publication',async()=>{
 const db=new TransactionDatabase();await assert.rejects(previous(db,options),/Canonical inventory changed/);
 assert.equal(db.entries.get(parent).data.areaData.locations.flatMap(p=>p.linkedEventIds||[]).length,21);
 assert.equal([...db.entries.values()].find(x=>x.path.startsWith('festival_link_jobs/')).data.status,'retryable');
});
test('candidate completes both editions, publishes the four source-proven links once, then becomes idempotent',async()=>{
 const db=new TransactionDatabase(),before=new Map([...db.entries].map(([k,v])=>[k,structuredClone(v)]));
 const first=await candidate(db,options);assert.equal(first.status,'completed');assert.equal(first.eventWrites,1);assert.equal(first.paidSources,0);assert.equal(first.reports.length,2);
 assert.equal(db.entries.get(parent).data.areaData.locations.flatMap(p=>p.linkedEventIds||[]).length,21);assert.equal(db.entries.get('runtime_metadata/event_feed').data.version,315);
 for(const[k,v]of before)if((k==='events/area_7ebb4bc0846d26c4470e6842')===false&&!k.startsWith('festival_link_publications/')&&k!=='runtime_metadata/event_feed')assert.deepEqual(db.entries.get(k),v,'Unexpected canonical/source change '+k);
 const next=await candidate(db,options);assert.equal(next.status,'completed');assert.equal(next.eventWrites,0);assert.equal(next.paidSources,0);
 const writes=db.writes.length;assert.equal((await candidate(db,options)).status,'already_completed');assert.equal(db.writes.length,writes);
 assert.equal(db.writes.filter(w=>w.path===parent).length,1);assert.equal(db.entries.get('runtime_metadata/event_feed').data.version,315);
});
test('real canonical-child drift remains fenced while registered parents are excluded from child inventory',async()=>{
 const db=new TransactionDatabase();db.beforeTransaction=n=>{if(n===3){const path='venues/slug_thetivolicinema/events/6jnJDvVa88NAjhSxFTc5',e=db.entries.get(path);assert(e);e.version.nanoseconds+=1;}};
 await assert.rejects(candidate(db,options),/Canonical inventory changed/);assert.equal([...db.entries.values()].find(x=>x.path.startsWith('festival_link_jobs/')).data.status,'retryable');
});
test('another registered parent changing remains fenced before any public write',async()=>{
 const db=new TransactionDatabase();db.beforeTransaction=n=>{if(n===2){const entry=db.entries.get('events/local_pumpkin_2026');assert(entry);entry.version.nanoseconds+=1;}};
 await assert.rejects(candidate(db,options),/festival_reference_drift/);assert.equal(db.writes.filter(w=>w.path===parent).length,0);
});
