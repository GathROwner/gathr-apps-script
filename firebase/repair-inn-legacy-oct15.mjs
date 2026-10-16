// Exact reviewed targets. Dry-run by default; never replays models or deletes media.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {storedIdentity} from './harvest-oct15-spec.mjs';
import {exec} from 'node:child_process';import {promisify} from 'node:util';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const dir=path.join(import.meta.dirname,'artifacts/inn-legacy-oct15'),original=JSON.parse(await fs.readFile(path.join(dir,'capture.json'),'utf8'));
const venuePath='venues/fb_100063617721610',feedPath='runtime_metadata/event_feed',holdPath='parser_integrity_holds/inn_guest_foraging_1693177699479471';
const eventPaths=['5vX5hheEeQZvGWW2MktD','BI5tR0hAivbQzolfh1La','Xl1BWOTyBytkqqD9tQsL'].map(id=>venuePath+'/events/'+id);
const faq='https://innatbayfortune.com/faqs-2/',harvest='https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/';
const plain=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Parser must be idle');
const credential=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});const db=admin.firestore();
try{
 const paths=[venuePath,...eventPaths,feedPath,holdPath,...original.sources.map(s=>s.path)].sort();
 const [docs,all,locks,page]=await Promise.all([db.getAll(...paths.map(p=>db.doc(p))),db.collectionGroup('events').get(),db.collection('processing_locks').get(),fetch(faq,{signal:AbortSignal.timeout(20000)}).then(async r=>{assert.equal(r.status,200);assert.equal(new URL(r.url).hostname,'innatbayfortune.com');return r.text();})]);idle(locks.docs);
 const documents=docs.map(wrap),byPath=new Map(documents.map(d=>[d.path,d]));
 for(const old of [...original.documents,...original.sources])assert.deepEqual(byPath.get(old.path),old,'Reviewed target/source drift '+old.path);
 assert.equal(byPath.get(holdPath).exists,false,'Hold already exists');assert.equal(byPath.get(feedPath).data.version,267);
 const text=page.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/\s+/g,' ');
 assert(/May 15.{0,30}October 10.{0,15}2026/.test(text),'Official FireWorks season changed');assert(/4(?::00)?\s*PM\s*\|\s*Culinary Farm Tour/i.test(text),'Official guided tour clock changed');
 assert(/Saturday\s*\|\s*Foragers Tour.{0,180}Nick/.test(text)&&/Sunday\s*\|\s*Chefs Tour.{0,180}Matt/.test(text),'Weekend tour assignments changed');
 const venue=byPath.get(venuePath).data;assert(!venue.reviewedOccurrenceConstraints,'Existing constraint policy needs separate review');
 const events=eventPaths.map(p=>byPath.get(p).data);assert.deepEqual(events.map(e=>e.uniqueId),['1640727444724497_871151af377c98ef','1640727444724497_96565c100ba727a8','1693177699479471_7ea6ddff0c1f9f9c']);
 assert.deepEqual(events.map(e=>e.startTime),['16:00','16:00','15:00']);assert.deepEqual(events.map(e=>e.recurringPattern),['weekly_saturday','weekly_sunday','none']);
 const roots=new Set(events.map(e=>e.uniqueId.split('_')[0]));
 const related=all.docs.filter(d=>d.ref.path.startsWith(venuePath+'/events/')||roots.has(String(d.get('uniqueId')||'').split('_')[0])||(d.get('sourceUniqueIds')||[]).some(id=>roots.has(id))).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
 assert.deepEqual(related,original.siblings.sort((a,b)=>a.path.localeCompare(b.path)),'Source-linked sibling drift');
 const identities=e=>[...new Set([e.uniqueId,storedIdentity(e.uniqueId.split('_')[0],e),storedIdentity(e.uniqueId.split('_')[0],e,venue.name,'')])].sort();
 const reviewId='inn-season-and-morning-foraging-20261015';
 const constraints=events.map((e,i)=>({sourceUniqueId:e.uniqueId.split('_')[0],uniqueIds:identities(e),reviewId,sourceUrls:i<2?[faq]:[harvest],action:i<2?'season_bound':'hold',...(i<2?{untilDate:'2026-10-10',startTime:'16:00',recurringPattern:e.recurringPattern}:{})}));
 const changes=eventPaths.slice(0,2).map((p,i)=>({path:p,kind:'update',patch:{recurrenceUntilDate:'2026-10-10',endTime:'',timeFlags:{...events[i].timeFlags,start:{source:'explicit',evidence:'venue_website:'+faq+' | Culinary Farm Tour 4:00 PM; Saturdays Nick / Sundays Matt; FireWorks season ends October 10, 2026'},end:{source:'none',toClose:false,evidence:'No exact guided-tour finish is advertised'}},timeResolution:{hoursUsed:false,reason:'reviewed_seasonal_tour_start_only',sourceUrl:faq},eventIntegrityCorrection:{reviewId,reason:'verified_season_cutoff_and_unadvertised_finish'}}}));
 changes.push({path:eventPaths[2],kind:'delete'},{path:venuePath,kind:'update',patch:{reviewedOccurrenceConstraints:constraints}},
  {path:holdPath,kind:'create',payload:{version:1,status:'held',reason:'morning_activity_exact_start_unverified',reviewId,originalEventPath:eventPaths[2],sourceUniqueId:roots.has('1693177699479471')?'1693177699479471':'',sourceSnapshotPath:original.sources.find(s=>s.data.uniqueId==='1693177699479471').path,originalEvent:events[2],sourceUrl:harvest,publicReplacementCreated:false}});
 const capture={version:1,documents,related,changes,feedVersionChange:{path:feedPath,from:267,to:268},officialEvidence:{url:faq,htmlSha256:createHash('sha256').update(page).digest('hex'),seasonUntil:'2026-10-10',tourStart:'16:00'},unchangedHarvestEvents:related.filter(d=>!eventPaths.includes(d.path)).map(d=>d.path)};
 assert.equal(capture.unchangedHarvestEvents.length,12);const fingerprint=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(dir,{recursive:true});
 const backupPath=path.join(dir,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 if(!apply){const planPath=path.join(dir,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',fingerprint,backupPath,changes,feedVersionChange:capture.feedVersionChange,requiredRelease:'reviewedOccurrenceConstraints guard on all three parsers',liveWrites:0},null,2));console.log(JSON.stringify({planPath,backupPath,tourUpdates:2,falseClockDelete:1,privateHolds:1,venuePolicies:1,preservedHarvest:12,liveWrites:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.fingerprint,fingerprint,'Approved plan drift');assert.deepEqual(plan.changes,changes);
  // Fresh serving verification is supplied independently, never inferred from checkout.
  const release=JSON.parse(await fs.readFile(path.join(dir,'serving-after.json'),'utf8'));assert(release.constraintGuardIncluded===true&&release.rows.length===3&&release.rows.every(r=>r.state==='ACTIVE'&&r.trafficPercent===100&&r.hash===release.rows[0].hash),'Verified constraint release required');
  const run=promisify(exec);await Promise.all([['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].map(async([name,region])=>{const f=JSON.parse((await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format="json(state,labels.firebase-functions-hash,serviceConfig.allTrafficOnLatestRevision)"`)).stdout);assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],release.rows[0].hash);assert.equal(f.serviceConfig.allTrafficOnLatestRevision,true);}));
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);assert.deepEqual((await tx.getAll(...docs.map(d=>d.ref))).map(wrap),documents,'Reference drift');const current=(await tx.get(db.collectionGroup('events'))).docs.filter(d=>d.ref.path.startsWith(venuePath+'/events/')||roots.has(String(d.get('uniqueId')||'').split('_')[0])||(d.get('sourceUniqueIds')||[]).some(id=>roots.has(id))).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(current,related,'Sibling drift');
   for(const c of changes){if(c.kind==='delete')tx.delete(db.doc(c.path));else if(c.kind==='create')tx.create(db.doc(c.path),{...c.payload,createdAt:admin.firestore.FieldValue.serverTimestamp()});else tx.update(db.doc(c.path),{...c.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}tx.update(db.doc(feedPath),{version:268,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const resultPath=path.join(dir,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({backupPath,changes,feedVersion:268,mediaWrites:0},null,2));console.log(JSON.stringify({resultPath,applied:5,feedVersion:268,mediaWrites:0}));
 }
}finally{await admin.app().delete();}
