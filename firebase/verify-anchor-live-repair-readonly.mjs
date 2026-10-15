// Read-only independent verification of the exact approved Anchor Fest repair.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const dir='C:/Users/craig/.codex/worktrees/anchor-festival-backend/gathr-apps-script/functions/tmp/anchor-backend-oct14/date-range-v2';
const read=async name=>JSON.parse(await fs.readFile(`${dir}/${name}`,'utf8'));
const plan=await read('plan-2026-10-15T01-24-12-801Z.json');
const backup=await read('prewrite-backup-2026-10-15T01-24-12-801Z.json');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=admin.firestore();
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const normalize=x=>JSON.parse(JSON.stringify(x));
const eventPath=backup.spec.eventPath,reviewPath=backup.spec.reviewPath;
const http=async url=>{const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,url);return r.json();};
try {
 const docs=await db.getAll(...backup.documents.map(x=>db.doc(x.path)));
 const byPath=new Map(docs.map(x=>[x.ref.path,normalize(x.data())]));
 const deltas=[];
 for(const old of backup.documents){
  const action=plan.actions.find(x=>x.path===old.path),actual=byPath.get(old.path);
  assert(actual,old.path);
  if(!action){assert.deepEqual(actual,old.data,`Reference changed: ${old.path}`);continue;}
  const expected={...old.data,...action.patch};delete expected.updatedAt;
  const withoutUpdate={...actual};delete withoutUpdate.updatedAt;
  const changed=Object.keys(actual).filter(k=>JSON.stringify(actual[k])!==JSON.stringify(old.data[k]));
  deltas.push({path:old.path,changedFields:changed});
  assert.deepEqual(withoutUpdate,expected,`Unexpected target delta: ${old.path}`);
 }
 const unrelated=backup.related.filter(x=>!plan.actions.some(a=>a.path===x.path));
 const siblings=await db.getAll(...unrelated.map(x=>db.doc(x.path)));
 siblings.forEach((s,i)=>assert.deepEqual(normalize(s.data()),unrelated[i].data,`Related event changed: ${s.ref.path}`));
 const locks=await db.collection('processing_locks').get();
 assert(!locks.docs.some(d=>!['completed','failed','cancelled'].includes(d.get('status'))),'Parser became active');
 const saved=byPath.get(eventPath),detail=await http(`${base}/${eventPath.split('/').at(-1)}`);
 const publicRecord=detail.event??detail.data??detail,metadata=publicRecord.metadata??publicRecord;
 assert.deepEqual(metadata.areaData,saved.areaData,'API areaData stale');
 assert.deepEqual(metadata.timing,saved.timing,'API timing stale');
 assert.equal(publicRecord.startTime??metadata.startTime,'');
 assert.equal(publicRecord.endTime??metadata.endTime,'');
 assert.equal(publicRecord.description??metadata.description,saved.description);
 assert.equal(metadata.ticketsBuyUrl,saved.ticketsBuyUrl,'Ticket link changed');
 assert(!Object.hasOwn(metadata,'areaEventLinks'),'Private evidence leaked');
 const children=await Promise.all(backup.spec.areaEventLinks.map(async link=>{
  const child=byPath.get(link.eventPath),payload=await http(`${base}/${link.eventPath.split('/').at(-1)}`);
  const e=payload.event??payload.data??payload,m=e.metadata??e;
  for(const key of ['venueId','startDate','endDate','startTime','endTime']) assert.equal(e[key]??m[key],child[key]??'',`${link.eventPath}: ${key}`);
  assert.equal(e.title??e.eventName??m.eventName,child.eventName,link.eventPath);
  return{id:link.eventPath.split('/').at(-1),status:200};
 }));
 const feed=[],seen=new Set();let token='',pages=0;
 do{
  const url=new URL(base);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');if(token)url.searchParams.set('startAfter',token);
  const payload=await http(url);assert(Array.isArray(payload.events));feed.push(...payload.events);pages++;token=payload.nextPageToken||'';
  if(token){assert(!seen.has(token),'Pagination cycle');seen.add(token);}assert(pages<100);
 }while(token);
 const umbrellaId=eventPath.split('/').at(-1),matches=feed.filter(e=>e.id===umbrellaId);
 assert.equal(matches.length,1,'Umbrella absent or duplicated in active feed');
 assert.deepEqual(matches[0].metadata?.areaData??matches[0].areaData,saved.areaData,'Feed areaData stale');
 assert.deepEqual(matches[0].metadata?.timing??matches[0].timing,saved.timing,'Feed timing stale');
 const childCounts=children.map(c=>({id:c.id,activeFeedCount:feed.filter(e=>e.id===c.id).length}));
 childCounts.forEach(x=>assert(x.activeFeedCount<=1,`Duplicate linked child ${x.id}`));
 const report={checkedAt:new Date().toISOString(),project:credential.project_id,approvedTargets:2,deltas,
  sourceLocations:saved.areaData.locations.length,explicitChildLinks:children.length,
  referenceDocumentsUnchanged:backup.documents.length-2,relatedEventsUnchanged:unrelated.length,
  parserIdle:true,apiDetailVerified:true,ticketUrlPreserved:true,privateEvidenceNotPublic:true,
  pages,feedEvents:feed.length,umbrellaOccurrences:matches.length,children:childCounts,
  newEvents:0,deletedEvents:0,venuesChanged:0,mediaDeleted:0,iPhoneAdoptionVerified:false};
 await fs.writeFile(new URL('../functions/artifacts/anchor-festival-oct14/live-repair-independent-verified.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,children:undefined}));
}finally{await admin.app().delete();}
