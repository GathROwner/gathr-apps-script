// Reviewed bootstrap with ZERO seeded child links; actual worker owns all links.
// Default dry run. Never edits existing children, venues or media.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),dir='functions/artifacts/pumpkin-overview-oct16';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const latest=JSON.parse(await fs.readFile(dir+'/reviewed-bootstrap-latest.json','utf8'));
const requested=process.argv.find(a=>a.startsWith('--plan='))?.slice(7)||latest.planPath;
assert.equal(requested,latest.planPath,'Only the exact reviewed plan is accepted');
const plan=JSON.parse(await fs.readFile(requested,'utf8'));assert.equal(hash(plan),latest.planHash);
assert.equal(plan.project,'gathr-migrated');assert.equal(plan.proposedOnly,true);
const rootPath='events/local_pumpkin_2026',reviewPath='city_level_event_reviews/local_pumpkin_review_2026';
const cachePath='festival_link_captures/c6a3729f47a2ea158ab01830a3bcccf42db58313e54e556894aa7dd6b3f4086f';
assert.deepEqual(plan.changes.map(c=>[c.path,c.action]),[[rootPath,'create'],[reviewPath,'create'],[cachePath,'create'],['runtime_metadata/event_feed','update']]);
assert.equal(plan.worker.publicEventPath,rootPath);assert.equal(plan.worker.manualChildLinksSeeded,0);assert.equal(plan.worker.childrenModified,0);
const expected=Array.from({length:13},(_,i)=>`oct14_repair_festival_${['20261016','20261017','20261019','20261020','20261021','20261024','20261026','20261027','20261028','20261029','20261030','20261030','20261031'][i]}_${i+1}`);
assert.deepEqual(plan.worker.expectedAddedEventIds,expected);
assert.equal(plan.changes[0].data.areaData.locations.flatMap(p=>p.linkedEventIds||[]).length,0);
const release=JSON.parse(await fs.readFile(dir+'/assembly-worker.json','utf8'));
const releaseRequire=createRequire(release.root+'/functions/package.json'),admin=releaseRequire('firebase-admin');
const head=(await exec('git',['-C',release.root,'rev-parse','HEAD'])).stdout.trim();assert.equal(head,release.releaseCommit,'Worker release checkout drift');
assert.equal((await exec('git',['-C',release.root,'status','--porcelain','--untracked-files=no'])).stdout.trim(),'','Worker source is dirty');
const {runFestivalLinkWorker}=releaseRequire(release.root+'/functions/lib/services/festivalLinkWorker.js');
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,plan.project);
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const terminal=new Set(['completed','failed','cancelled','canceled','released']);
const assertLocks=q=>assert(q.docs.every(d=>terminal.has(String(d.get('status')))),'Active or unknown parser');
const version=d=>({seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds});
const checkPins=docs=>{for(const d of docs){const p=plan.pins.find(x=>x.path===d.ref.path);assert.equal(d.exists,p.exists,'Target existence drift: '+p.path);if(d.exists){assert.deepEqual(version(d),p.version,'Version drift: '+p.path);assert.equal(hash(d.data()),p.dataHash,'Content drift: '+p.path);}}};
const query=()=>db.collectionGroup('events').where('startDate','>=',plan.relatedInventoryScope.start).where('startDate','<=',plan.relatedInventoryScope.end).limit(5001);
const checkInventory=q=>{assert(q.size<=5000);const selected=q.docs.filter(d=>plan.relatedInventoryScope.venueIds.includes(d.get('venueId'))||/pumpkin|citrouille/i.test(d.get('eventName')||d.get('name')||''));assert.equal(hash(selected.map(d=>({path:d.ref.path,version:version(d)})).sort((a,b)=>a.path.localeCompare(b.path))),plan.relatedInventoryHash,'Related inventory drift');};
const pack=d=>({path:d.ref.path,exists:d.exists,...(d.exists?{version:version(d),data:d.data()}:{} )});
try{
 const [docs,locks,inventory]=await Promise.all([db.getAll(...plan.pins.map(p=>db.doc(p.path))),db.collection('processing_locks').get(),query().get()]);
 assertLocks(locks);checkPins(docs);checkInventory(inventory);
 const summary={plan:requested,planHash:latest.planHash,creates:[rootPath,reviewPath,cachePath],automaticLinks:expected,childWrites:0,venueWrites:0,mediaWrites:0,feedBefore:latest.feedBefore,feedAfter:latest.feedAfterWorker};
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({...summary,dryRun:true,liveWrites:0}));}
 else{
  // Independent readback must be fresh and prove all seven narrow releases.
  const {stdout}=await exec(process.execPath,['firebase/pumpkin-release-serving-readonly.mjs','after'],{maxBuffer:4194304});
  const serving=JSON.parse(await fs.readFile(dir+'/serving-after.json','utf8'));assert.equal(serving.rows.length,7);assert(Date.now()-Date.parse(serving.checkedAt)<120000);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=dir+'/prewrite-backup-'+stamp+'.json';
  await fs.writeFile(backup,JSON.stringify({capturedAt:new Date().toISOString(),summary,serving,documents:docs.map(pack),locks:locks.docs.map(pack),related:inventory.docs.map(pack)},null,2));
  await db.runTransaction(async tx=>{
   const freshLocks=await tx.get(db.collection('processing_locks')),freshDocs=await tx.getAll(...plan.pins.map(p=>db.doc(p.path))),freshInventory=await tx.get(query());
   assertLocks(freshLocks);checkPins(freshDocs);checkInventory(freshInventory);
   for(const change of plan.changes){if(change.action==='create')tx.create(db.doc(change.path),change.data);else tx.update(db.doc(change.path),{...change.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
  });
  const options={mode:'publish',fileId:plan.worker.fileId,editionId:'local_pumpkin_2026',asOf:'2026-10-16'};
  const proposed=await runFestivalLinkWorker(db,{...options,dryRun:true});
  await fs.writeFile(dir+'/post-bootstrap-proposal-'+stamp+'.json',JSON.stringify(proposed,null,2));
  assert.equal(proposed.status,'completed','Bootstrap succeeded; worker held. Do not broaden targets');assert.equal(proposed.paidSources,0);assert.equal(proposed.reports.length,1);assert.deepEqual(proposed.reports[0].addedEventIds,expected);
  const result=await runFestivalLinkWorker(db,options);
  await fs.writeFile(dir+'/worker-applied-'+stamp+'.json',JSON.stringify(result,null,2));
  assert.equal(result.status,'completed');assert.equal(result.paidSources,0);assert.deepEqual(result.reports[0].addedEventIds,expected);
  const root=await db.doc(rootPath).get(),marker=await db.doc('runtime_metadata/event_feed').get();
  assert.deepEqual(root.get('areaData.locations').flatMap(p=>p.linkedEventIds||[]).sort(),[...expected].sort());assert.equal(marker.get('version'),latest.feedAfterWorker);
  const allowed=new Set([...plan.changes.map(c=>c.path),plan.worker.ownershipPath,plan.worker.jobPath]);
  const protectedPins=plan.pins.filter(p=>!allowed.has(p.path));
  checkPins(await db.getAll(...protectedPins.map(p=>db.doc(p.path))));
  for(const change of plan.changes.filter(c=>c.action==='create'&&c.path!==rootPath))assert.equal(hash((await db.doc(change.path).get()).data()),hash(change.data),'Unexpected created-document delta: '+change.path);
  const actualRoot=structuredClone(root.data()),expectedRoot=structuredClone(plan.changes[0].data);delete actualRoot.areaData;delete expectedRoot.areaData;delete actualRoot.updatedAt;delete expectedRoot.updatedAt;assert.equal(hash(actualRoot),hash(expectedRoot),'Unexpected root field delta');
  const repeat=await runFestivalLinkWorker(db,{...options,dryRun:true});assert.equal(repeat.status,'completed');assert.equal(repeat.reports[0].addedEventIds.length,0);
  const report={...summary,backup,result,repeat,checkedAt:new Date().toISOString(),protectedDocumentsUnchanged:protectedPins.length,liveApplied:true};
  await fs.writeFile(dir+'/applied-'+stamp+'.json',JSON.stringify(report,null,2));
  const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
  const request=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);return response.json();};
  const apiArea=event=>event.areaData||event.metadata?.areaData;
  const assertLinks=event=>{assert(event);assert.deepEqual(apiArea(event).locations.flatMap(p=>p.linkedEventIds||[]).sort(),[...expected].sort());assert(!/Review reasons:|Observed broad location:/i.test(event.description||''));};
  const detail=(await request(base+'/local_pumpkin_2026?dateOnlyActivities=v1')).event;assertLinks(detail);
  for(const id of expected){const child=(await request(base+'/'+id+'?dateOnlyActivities=v1')).event;assert.equal(child.id,id);}
  const feed=[];let cursor='',pages=0;const seen=new Set();
  do{const url=new URL(base);url.searchParams.set('includeExpired','false');url.searchParams.set('dateOnlyActivities','v1');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('startAfter',cursor);
   const page=await request(url);assert(Array.isArray(page.events));feed.push(...page.events);cursor=page.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
  }while(cursor);
  const matches=feed.filter(e=>e.id==='local_pumpkin_2026');assert.equal(matches.length,1);assertLinks(matches[0]);for(const id of expected)assert.equal(feed.filter(e=>e.id===id).length,1,'Missing/duplicate child in active feed: '+id);
  await fs.writeFile(dir+'/api-verified-'+stamp+'.json',JSON.stringify({checkedAt:new Date().toISOString(),root:'local_pumpkin_2026',links:expected,rootFeedCount:matches.length,childFeedCounts:expected.map(id=>({id,count:feed.filter(e=>e.id===id).length})),pages,feedCount:feed.length,detailVerified:true,liveWrites:0},null,2));
  console.log(JSON.stringify({...summary,backup,resultPath:dir+'/applied-'+stamp+'.json',apiVerification:dir+'/api-verified-'+stamp+'.json',liveApplied:true}));
 }
}finally{await admin.app().delete();}
