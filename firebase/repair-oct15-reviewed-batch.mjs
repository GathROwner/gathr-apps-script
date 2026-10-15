// Exact five-event reviewed batch. Default dry run; no models, uploads or replay.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));
assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'artifacts/oct15-reviewed-batch');
const provenancePlan=JSON.parse(await fs.readFile(path.join(import.meta.dirname,'artifacts/oct15-hardening/festival-provenance-plan-2026-10-15T21-40-03-231Z.json'),'utf8'));
const provenanceBackup=JSON.parse(await fs.readFile(provenancePlan.backup,'utf8'));
assert.equal(provenancePlan.changes.length,4);
assert.deepEqual(provenancePlan.changes.map(c=>c.path),[
 'venues/slug_trailsidemusichall/events/J1TauchdK3akdCxHuasT',
 'venues/slug_theguildpei/events/mgXvpu5EB2N7eqnyeHa3',
 'venues/slug_theguildpei/events/80rdBjhcuZ0U4udVx0a2',
 'venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo']);
for(const c of provenancePlan.changes){
 assert.equal(c.sourceId,'1564814712352727');assert.deepEqual(Object.keys(c.patch),['sourceUniqueIds']);
 const old=provenanceBackup.documents.find(d=>d.path===c.path);assert(old);
 assert.deepEqual(c.patch.sourceUniqueIds,[...(old.data.sourceUniqueIds||[]),'1564814712352727']);
}
const fileId='1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit',sourceId='1558539286292403';
const sourcePath=`parse_snapshots/${fileId}_269_1792071099250`;
const venuePath='venues/slug_trailsidemusichall';
const target=venuePath+'/events/oct15_mcfadyen_20261119_2000';
const feedPath='runtime_metadata/event_feed';
const ticket='https://locarius.io/events/4932/daniel-james-mcfadyen-november-19th-25-doors-630-pm';
const poster='https://img.locarius.io/1820/22a1764e-0ea9-45b6-9818-a68630ef56d0/original.jpg';
const api='https://trailside.ca/api/events/locarius';
const sourceUrl='https://www.facebook.com/TrailsideMusicHall/posts/pfbid0W1udjHnFJVNeWVgRCjRsBB9LgbSoL2CgC8brNEdauTeT9jN1kM4GxX3iDyxKnHELl';
const plain=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks repair');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const occurrenceTargets=[...provenancePlan.changes.map(c=>({venueId:c.path.split('/')[1],date:c.date})),{venueId:'slug_trailsidemusichall',date:'2026-11-19'}];
const related=d=>occurrenceTargets.some(t=>d.get('venueId')===t.venueId&&d.get('startDate')===t.date)||
  [sourceId,'1564814712352727'].some(id=>String(d.get('uniqueId')||'').startsWith(id+'_')||(d.get('sourceUniqueIds')||[]).includes(id));
const siblings=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
async function evidence(){
 const [r,p]=await Promise.all([fetch(api,{signal:AbortSignal.timeout(20000)}),fetch(poster,{signal:AbortSignal.timeout(20000)})]);
 assert.equal(r.status,200);assert.equal(p.status,200);assert.equal(new URL(r.url).hostname,'trailside.ca');
 const response=await r.json(),records=response?.body?.result;assert(Array.isArray(records));
 const matches=records.filter(e=>e.url===ticket);assert.equal(matches.length,1);
 const e=matches[0];assert.equal(e.name,'Daniel James McFadyen - November 19th - $25 - Doors 6:30 PM');
 assert.equal(e.start.timezone,'America/Halifax');assert.equal(e.start.local,'Thursday, November 19, 2026 at 08:00 PM');
 assert.equal(e.start.utc,'2026-11-20T00:00:24.039Z');assert.equal(e.logo,poster);
 const bytes=Buffer.from(await p.arrayBuffer());
 return {ticketEvidence:{api,name:e.name,url:e.url,start:e.start,logo:e.logo,posterSha256:hash(bytes)},response,bytes};
}
function buildPayload(venue,source){
 const title='Daniel James McFadyen live at the Trailside';
 const facts={schema:'expanded_event_v2',eventName:title.toLowerCase(),startDate:'2026 11 19',endDate:'2026 11 19',startTime:'20 00',endTime:'',venueName:'trailside music hall',additionalLocation:''};
 const uniqueId=sourceId+'_'+createHash('sha1').update(JSON.stringify(facts)).digest('hex').slice(0,16);
 const evidence=`venue_website:${ticket} | ticket API performance start 2026-11-19 20:00 America/Halifax; separate doors 18:30`;
 const icon=venue.profileImage||venue.profileImageUrl||venue.icon||'';
 assert(/^https:\/\/storage\.googleapis\.com\/gathr-uploaded-images\/profilepictures\//.test(icon),'Validated existing venue profile required');
 return {uniqueId,sourceUniqueIds:[sourceId],sourceUrls:[sourceUrl,ticket],sourceOccurrenceCount:1,
  establishment:'Trailside Music Hall',venueId:'slug_trailsidemusichall',locationScope:'venue',locationLabel:'Trailside Music Hall',locationPrecision:'exact',locationReviewStatus:'not_needed',
  name:title,eventName:title,eventType:'live_music',category:'Live Music',isEvent:'Yes',isFoodSpecial:'No',_sourceType:'event',
  description:'Daniel James McFadyen performs at Trailside Music Hall in Charlottetown on November 19. Showtime is 8 p.m.; doors open at 6:30 p.m. Tickets are $25. An exact finish time is not advertised.',
  startDate:'2026-11-19',endDate:'2026-11-19',startTime:'20:00',endTime:'',isRecurring:'No',recurringPattern:'none',
  price:'$25',ticketPrice:'$25',ticketLink:ticket,ticketsBuyUrl:ticket,ticketProvider:'Locarius',externalLinks:[ticket],
  facebookUrl:source.facebookUrl,cleanedFacebookUrl:source.facebookUrl,
  address:venue.address,rawAddress:venue.rawAddress||venue.address,normalizedAddress:venue.normalizedAddress||venue.address,addressSource:'venue',addressNormalizationIssues:[],
  latitude:venue.latitude,longitude:venue.longitude,icon,
  image:poster,imageUrl:poster,relevantImageUrl:poster,mediaUrls:[poster],
  imageProvenance:{version:1,primarySource:'ticket_image',primaryField:'relevantImageUrl',primaryUrl:poster,isFallback:false,
   sourceFields:['relevantImageUrl','image','imageUrl','mediaUrls','icon'],media:[...['relevantImageUrl','image','imageUrl','mediaUrls'].map(field=>({url:poster,source:'ticket_image',field,isPrimary:field==='relevantImageUrl',isFallback:false})),{url:icon,source:'profile_image',field:'icon',isPrimary:false,isFallback:true}],selectionReason:'source_verified_exact_ticket_event',updatedBy:'manual_repair'},
  timeFlags:{start:{source:'explicit',evidence},end:{source:'none',toClose:false,evidence:'Finish time not advertised'}},
  timeResolution:{hoursUsed:false,reason:'source_verified_ticket_performance_start',sourceUrl:ticket},recoveryRun:'oct15-reviewed-batch'};
}
try{
 const paths=[...new Set([...provenanceBackup.documents.map(d=>d.path),sourcePath,venuePath,target,feedPath])].sort();
 const [refs,all,locks,proof]=await Promise.all([db.getAll(...paths.map(p=>db.doc(p))),db.collectionGroup('events').get(),db.collection('processing_locks').get(),evidence()]);
 idle(locks.docs);const byPath=new Map(refs.map(d=>[d.ref.path,d]));
 assert(!byPath.get(target).exists);assert(refs.filter(d=>d.ref.path!==target).every(d=>d.exists));
 for(const old of provenanceBackup.documents)assert.deepEqual(wrap(byPath.get(old.path)),{...old,exists:true},'Reviewed provenance reference drift');
 const venue=plain(byPath.get(venuePath).data()),source=plain(byPath.get(sourcePath).data());
 assert.equal(venue.name,'Trailside Music Hall');assert.equal(source.uniqueId,sourceId);assert.equal(source.rowIndex,269);
 assert.match(source.inputText,/Daniel James McFadyen live at the Trailside in Charlottetown November 19th/);
 assert.match(source.inputText,/Tickets and more show info available at www\.trailside\.ca/);
 assert(!all.docs.some(d=>d.get('venueId')==='slug_trailsidemusichall'&&d.get('startDate')==='2026-11-19'&&/McFadyen|Daniel James/i.test(d.get('eventName')||'')),'Matching show already exists');
 const payload=plain(buildPayload(venue,source));assert(Number.isFinite(+payload.latitude)&&Number.isFinite(+payload.longitude));
 assert.equal((await fetch(payload.icon,{method:'HEAD',signal:AbortSignal.timeout(20000)})).status,200,'Existing profile image unavailable');
 assert(!all.docs.some(d=>d.get('uniqueId')===payload.uniqueId),'Exact source occurrence exists');
 const version=byPath.get(feedPath).get('version');assert.equal(version,264,'Feed marker changed; regenerate/review batch');
 const changes=[...provenancePlan.changes.map(c=>({path:c.path,kind:'update',patch:c.patch})),{path:target,kind:'create',payload}];
 const capture={schema:1,changes,feedVersionChange:{path:feedPath,from:version,to:version+1},documents:refs.map(wrap),siblings:siblings(all.docs),ticketEvidence:proof.ticketEvidence};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 await fs.writeFile(path.join(out,`ticket-response-${stamp}.json`),JSON.stringify(proof.response,null,2));
 await fs.writeFile(path.join(out,'ticket-poster.jpg'),proof.bytes);
 if(!apply){const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',snapshotHash,backupPath,changes,feedVersionChange:capture.feedVersionChange,requiredRelease:'Reviewed ticket API start-role guard; independently verified ACTIVE on all three parser functions',automaticFestivalPublication:false},null,2));console.log(JSON.stringify({planPath,backupPath,creates:1,provenanceUpdates:4,feedVersion:version+1,guardedReferences:refs.length,relatedEvents:capture.siblings.length,liveWrites:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.snapshotHash,snapshotHash,'Exact approved record/source/sibling/ticket/media/marker drift');assert.deepEqual(plan.changes,changes);assert.deepEqual(plan.feedVersionChange,capture.feedVersionChange);
  const expectedHash=process.env.OCT15_BATCH_RELEASE_HASH;assert(/^[a-f0-9]{40}$/.test(expectedHash||''),'Independently verified guard release hash required');
  const run=promisify(exec);await Promise.all([['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].map(async([name,region])=>{const r=await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format="json(state,labels.firebase-functions-hash)"`);const f=JSON.parse(r.stdout);assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],expectedHash);}));
  await db.runTransaction(async tx=>{
   idle((await tx.get(db.collection('processing_locks'))).docs);assert.deepEqual((await tx.getAll(...refs.map(d=>d.ref))).map(wrap),capture.documents,'Reference drift');assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs),capture.siblings,'Sibling drift');
   for(const change of changes){if(change.kind==='create')tx.create(db.doc(change.path),{...change.payload,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});else tx.update(db.doc(change.path),{...change.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
   tx.update(db.doc(feedPath),{version:version+1,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),backupPath,changes,feedVersionChange:capture.feedVersionChange,releaseHash:expectedHash,creates:1,updates:4,metadataUpdates:1,mediaWrites:0},null,2));console.log(JSON.stringify({resultPath,creates:1,updates:4,metadataUpdates:1,mediaWrites:0}));
 }
}finally{await admin.app().delete();}
