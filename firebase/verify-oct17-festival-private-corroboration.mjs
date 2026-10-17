/** Independent private-create/public-preservation and actual worker read-only proof. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const out=new URL('./artifacts/oct17-festival-corroboration/',import.meta.url),files=(await fs.readdir(out)).filter(f=>/^private-result-.*\.json$/.test(f));assert.equal(files.length,1);
const result=JSON.parse(await fs.readFile(new URL(files[0],out),'utf8'));assert.equal(result.status,'applied');const backup=JSON.parse(await fs.readFile(new URL(result.backup,out),'utf8'));
const require=createRequire(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/package.json',import.meta.url)),admin=require('firebase-admin'),{runFestivalLinkWorker}=require('./lib/services/festivalLinkWorker.js');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const query=q=>({where:(...a)=>query(q.where(...a)),orderBy:(...a)=>query(q.orderBy(...a)),limit:(...a)=>query(q.limit(...a)),get:()=>q.get()});
const readonly={collection:n=>query(db.collection(n)),collectionGroup:n=>query(db.collectionGroup(n)),doc:p=>({path:p,id:p.split('/').at(-1),get:()=>db.doc(p).get()}),getAll:(...refs)=>db.getAll(...refs.map(r=>db.doc(r.path))),runTransaction:async()=>{throw Error('Verifier forbids writes');}};
try{
 const fresh=await db.getAll(...backup.documents.map(d=>db.doc(d.path)));
 for(const d of fresh){const o=result.plan.operations.find(o=>o.path===d.ref.path),before=backup.documents.find(b=>b.path===d.ref.path);assert.equal(d.exists,o?true:before.exists);if(d.exists)assert.equal(hash(d.data()),hash(o?o.payload:before.data),'Unexpected delta '+d.ref.path);}
 const report=await runFestivalLinkWorker(readonly,{mode:'publish',dryRun:true,asOf:'2026-10-17',fileId:result.plan.fileId});
 assert.equal(report.sourceCount,145);assert.equal(report.eventWrites,0);assert.equal(report.paidSources,0);assert.equal(report.status,'completed');
 assert(report.reports.every(r=>r.reason==='no_public_delta'&&r.addedEventIds.length===0&&r.gaps.length===0&&r.unconfirmedItems.length===0));
 const harvest=report.reports.find(r=>r.editionId==='01q4d8wzK8R8VH0revQX');assert.equal(harvest.outcomes.filter(o=>o.status==='corroborated').length,3);assert.equal(harvest.outcomes.filter(o=>o.status==='self_reference').length,1);assert.equal(harvest.outcomes.filter(o=>o.status==='held').length,2);
 assert.equal(report.reports.find(r=>r.editionId==='area_7ebb4bc0846d26c4470e6842').outcomes.filter(o=>o.status==='held').length,22);
 const proof={checkedAt:new Date().toISOString(),privateCreates:3,receipts:4,unchangedReadSetDocuments:fresh.length-3,sourceCount:145,corroborated:3,selfReferences:1,harvestHolds:2,anchorHolds:22,publicWrites:0,liveWrites:0,paidSources:0,report};
 await fs.writeFile(new URL('private-independent-verification.json',out),JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,report:undefined}));
}finally{await app.delete();}
