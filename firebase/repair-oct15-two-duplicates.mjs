// Default read-only plan. Apply only the exact reviewed two-record deletion.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planPath=args.find(x=>x.startsWith('--plan='))?.slice(7);
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));assert.equal(apply,Boolean(planPath));
const cases=[{title:'Pressure Points conflicting 21:00 copy',venue:'slug_thetivolicinema',source:'1564814712352727',
  remove:'VtmHIyg7T7V4Tb0sC3Fo',keep:'nepcYF8RIzLrzPKBXjWX',removedTime:'21:00',keptTime:'18:00'},
 {title:'Pints East General Trivia same-session copy',venue:'sJQHqeQVXehTHcFarwc6',source:'122145244485157304',
  remove:'Ez7t4IXyxsxjRisCtHnC',keep:'oXz81O57WSQ1D4nGMkn6',removedTime:'18:30',keptTime:'18:30'}];
const fileId='1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit',out=path.resolve(import.meta.dirname,'artifacts/oct15-hardening');
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const eventPath=(c,id)=>`venues/${c.venue}/events/${id}`;
const plain=x=>JSON.parse(JSON.stringify(x));const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
async function idle(){const locks=await db.collection('processing_locks').get();assert(!locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks cleanup');assert((await db.doc('processed_datasets/'+fileId).get()).exists);assert(!(await db.doc('checkpoints/'+fileId).get()).exists);}
try{
 await idle();await fs.mkdir(out,{recursive:true});
 const sourceDocs=await db.collection('parse_snapshots').where('fileId','==',fileId).get();
 const sources=cases.map(c=>{const matches=sourceDocs.docs.filter(d=>d.get('uniqueId')===c.source);assert.equal(matches.length,1);return matches[0];});
 const refs=[...cases.flatMap(c=>[eventPath(c,c.remove),eventPath(c,c.keep),'venues/'+c.venue]),...sources.map(d=>d.ref.path)];
 const docs=await db.getAll(...refs.map(p=>db.doc(p)));const data=new Map(docs.map(d=>[d.ref.path,d]));
 for(const c of cases){const gone=data.get(eventPath(c,c.remove)),keeper=data.get(eventPath(c,c.keep));assert(gone.exists&&keeper.exists);
  assert.equal(gone.get('startDate'),'2026-10-16');assert.equal(keeper.get('startDate'),'2026-10-16');
  assert.equal(gone.get('startTime'),c.removedTime);assert.equal(keeper.get('startTime'),c.keptTime);
  assert(String(gone.get('uniqueId')).startsWith(c.source+'_'));
  if(c.venue==='slug_thetivolicinema'){assert(/Pressure Points/i.test(gone.get('eventName')));assert(/Pressure Points/i.test(keeper.get('eventName')));}
  else {assert.equal(gone.get('eventName'),'General Trivia');assert.equal(keeper.get('eventName'),'Trivia');assert(/Alex/i.test(gone.get('description'))&&/Alex/i.test(keeper.get('description')));}
 }
 const sameDate=await db.collectionGroup('events').where('startDate','==','2026-10-16').get();
 const siblings=sameDate.docs.filter(d=>cases.some(c=>c.venue===d.get('venueId')));
 const capture={version:1,fileId,actions:cases.map(c=>({title:c.title,action:'delete',path:eventPath(c,c.remove),keeper:eventPath(c,c.keep),date:'2026-10-16',source:c.source})),
   documents:[...new Map([...docs,...siblings].map(d=>[d.ref.path,wrap(d)])).values()]};
 const snapshotHash=hash(capture),now=stamp();
 if(!apply){const backup=path.join(out,`duplicate-backup-${now}.json`),plan=path.join(out,`duplicate-plan-${now}.json`);
  await fs.writeFile(backup,JSON.stringify(capture,null,2));await fs.writeFile(plan,JSON.stringify({snapshotHash,backup,actions:capture.actions},null,2));
  console.log(JSON.stringify({mode:'dry_run',plan,backup,actions:capture.actions,liveWrites:0}));
 }else{
  const approved=JSON.parse(await fs.readFile(path.resolve(planPath),'utf8'));assert.deepEqual(approved.actions,capture.actions);assert.equal(approved.snapshotHash,snapshotHash,'Reviewed document/source/sibling drift');
  const backup=path.join(out,`duplicate-prewrite-${now}.json`);await fs.writeFile(backup,JSON.stringify(capture,null,2));
  await idle();await db.runTransaction(async tx=>{const all=await tx.getAll(...capture.documents.map(x=>db.doc(x.path)));all.forEach((d,i)=>assert.deepEqual(wrap(d),capture.documents[i],'Transaction reference drift'));
    for(const c of cases)tx.delete(db.doc(eventPath(c,c.remove)));});
  const verification=await db.getAll(...cases.flatMap(c=>[db.doc(eventPath(c,c.remove)),db.doc(eventPath(c,c.keep))]));
  for(let i=0;i<cases.length;i++){assert(!verification[2*i].exists);assert.deepEqual(wrap(verification[2*i+1]),capture.documents.find(d=>d.path===eventPath(cases[i],cases[i].keep)));}
  const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
  for(const c of cases){assert.equal((await fetch(api+'/'+c.remove)).status,404);assert.equal((await fetch(api+'/'+c.keep)).status,200);}
  let cursor='',pages=0,feedCount=0;const seen=new Set();
  do{const url=new URL(api);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('startAfter',cursor);
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const page=await response.json();assert(Array.isArray(page.events));
    assert(!page.events.some(e=>cases.some(c=>e.id===c.remove||e.id.startsWith(c.remove+'_'))));feedCount+=page.events.length;cursor=page.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
  }while(cursor);
  const result={appliedAt:new Date().toISOString(),backup,actions:capture.actions,deleted:2,keepersUnchanged:true,mediaDeleted:0,apiVerified:true,feedCount,pages};
  const resultPath=path.join(out,`duplicate-applied-${now}.json`);await fs.writeFile(resultPath,JSON.stringify(result,null,2));console.log(JSON.stringify({resultPath,...result}));
 }
}finally{await admin.app().delete();}
