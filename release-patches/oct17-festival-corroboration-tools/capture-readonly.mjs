// Coordinator-run read-only capture. No write methods are exposed to the worker.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./assembly/package.json',import.meta.url));
const admin=require('firebase-admin');
const credentialPath=process.env.GATHR_SERVICE_ACCOUNT_PATH;
if(!credentialPath)throw Error('Explicit GATHR_SERVICE_ACCOUNT_PATH required');
const credential=JSON.parse(await fs.readFile(credentialPath,'utf8'));
if(credential.project_id!=='gathr-migrated')throw Error('Unexpected Firebase project');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const db=admin.firestore(),entries=new Map();
const save=d=>{entries.set(d.ref.path,{path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:undefined,updateTime:d.updateTime?.toDate().toISOString(),data:d.exists?d.data():undefined});return d;};
function query(q){return{where:(...a)=>query(q.where(...a)),orderBy:(...a)=>query(q.orderBy(...a)),limit:(...a)=>query(q.limit(...a)),get:async()=>{const r=await q.get();r.docs.forEach(save);return r;}};}
const readonly={collection:n=>query(db.collection(n)),collectionGroup:n=>query(db.collectionGroup(n)),doc:p=>({path:p,id:p.split('/').at(-1),get:async()=>save(await db.doc(p).get())}),getAll:async(...refs)=>(await db.getAll(...refs.map(r=>db.doc(r.path)))).map(save),runTransaction:async()=>{throw Error('Live writes forbidden');}};
const {runFestivalLinkWorker}=require('./lib/services/festivalLinkWorker.js');
const report=await runFestivalLinkWorker(readonly,{mode:'publish',dryRun:true,asOf:'2026-10-17',fileId:'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g'});
if(report.eventWrites!==0||report.paidSources!==0)throw Error('Unexpected worker effects');
const output=process.argv[2]||new URL('./live-inventory.json',import.meta.url);
await fs.writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),readOnly:true,projectId:'gathr-migrated',report,entries:[...entries.values()]},null,2));
console.log(JSON.stringify({output:String(output),documents:entries.size,sourceCount:report.sourceCount,eventWrites:report.eventWrites,paidSources:report.paidSources,editions:report.reports?.map(r=>({id:r.editionId,reason:r.reason,holds:r.outcomes.filter(o=>o.status==='held').length}))}));
await admin.app().delete();
