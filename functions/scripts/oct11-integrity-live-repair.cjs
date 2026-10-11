// Exact, reviewable October 11 data repair. Default is read-only.
// Apply only an explicitly approved saved plan: --apply <plan.json>.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/luna-oct11-integrity-repair');
const keyPath = 'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json';
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (key.project_id !== 'gathr-migrated') throw Error('Wrong credential project');
admin.initializeApp({credential:admin.credential.cert(key), projectId:'gathr-migrated'});
const {buildExpandedEventStoredUniqueId} = require('../lib/processing/rowProcessor.js');
const db = admin.firestore();
const encode = value => {
  if (value instanceof admin.firestore.Timestamp) return {$type:'Timestamp', seconds:value.seconds, nanoseconds:value.nanoseconds};
  if (value instanceof admin.firestore.GeoPoint) return {$type:'GeoPoint', latitude:value.latitude, longitude:value.longitude};
  if (value instanceof admin.firestore.DocumentReference) return {$type:'Reference', path:value.path};
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
  return value;
};
const decode = value => {
  if (value?.$type==='Timestamp') return new admin.firestore.Timestamp(value.seconds,value.nanoseconds);
  if (value?.$type==='GeoPoint') return new admin.firestore.GeoPoint(value.latitude,value.longitude);
  if (value?.$type==='Reference') return db.doc(value.path);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
  return value;
};
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(encode(value))).digest('hex');
const cupVenue = 'slug_easternkingssportsplex';
const paths = {
  u13:`venues/${cupVenue}/events/0HKcUnxA1jou0pFpLmzI`,
  u11:`venues/${cupVenue}/events/zYyaYGXGRHRPOk1pTcNd`,
  u9:`venues/${cupVenue}/events/oct11_cup_u9_20261013`,
  karaoke:'venues/fb_100057766283684/events/3C9dqyOoaejurl8zjx3x',
  comedy:'venues/fb_100057766283684/events/O4FDKN8GUqCUld1ZhO8p',
  author:'venues/slug_florencesimmonsperformancehall/events/SEWO0qtndzRF6gyqMjbB',
  council:'venues/31MHpCb7juuQkKD5N98q/events/tX70MrxuGdaAHwV0lgtj',
  drive:'city_level_event_reviews/cityevt_7040cff228c17373d2ea4ea3',
};
async function assertIdle() {
  const locks = await db.collection('processing_locks').get();
  if (locks.docs.some(doc=>!['completed','failed','cancelled'].includes(doc.data().status))) throw Error('An active parser lock prevents live repair');
}
async function buildPlan() {
  await assertIdle();
  const fixtures = JSON.parse(fs.readFileSync(path.join(root,'src/processing/__fixtures__/oct11-integrity-repair.json'),'utf8'));
  const snaps = await db.getAll(...Object.values(paths).map(p=>db.doc(p)));
  const byPath = new Map(snaps.map(s=>[s.ref.path,s]));
  for (const [key,source,date] of [['author','1593322932387722_','2026-10-22'],['council','1565517958943059_','2026-10-14']]) {
    const data = byPath.get(paths[key]).data();
    if (!data || !String(data.uniqueId).startsWith(source) || data.startDate!==date) throw Error(`Changed ${key} identity`);
  }
  const cupInventory = await db.collection(`venues/${cupVenue}/events`).get();
  if (byPath.get(paths.u9).exists || cupInventory.docs.some(s=>s.data().startDate==='2026-10-13' && s.data().startTime==='16:20')) throw Error('U9 slot already exists; review instead of creating');
  for (const [key,time] of [['u11','17:30'],['u13','18:40']]) {
    const data = byPath.get(paths[key]).data();
    if (!data || data.startDate!=='2026-10-13' || data.startTime!==time || !String(data.uniqueId).startsWith('1664749465112438_')) throw Error(`Changed ${key} keeper`);
  }
  const changes = [];
  const update = (key,patch,reason) => {
    const snap = byPath.get(paths[key]);
    if (!snap.exists) throw Error(`Missing ${paths[key]}`);
    changes.push({action:'update',path:snap.ref.path,updateTime:encode(snap.updateTime),fingerprint:fingerprint(snap.data()),patch:encode(patch),reason});
  };
  const series = {isRecurring:true,recurringPattern:'weekly_tuesday',recurringDaysOfWeek:[],recurringWeekdaySequence:[],recurringWeekInterval:1,totalOccurrences:3,recurrenceUntilDate:'2026-10-27',recurrenceSourceUniqueId:'1668733748047343'};
  const cupDescription = group => `Free development camp for ${group} players on October 13, 20 and 27. October 13: Community Cup organizers; October 20: Campbell Hockey Development; October 27: Craig Jenkins. Eligibility follows the Souris Community Cup parameters in the source. Donations accepted for future programs.`;
  for (const group of ['U11','U13']) {
    const name = `Souris Community Cup ${group} Development Camp`;
    update(group.toLowerCase(),{...series,name,eventName:name,description:cupDescription(group),category:'Sports',eventType:'sports',isEvent:'Yes',isFoodSpecial:'No',ticketPrice:'Free',price:'Free'},`Identify ${group} and retain its existing ${group==='U11'?'17:30–18:30':'18:40–19:40'} slot`);
  }
  const cupSource = fixtures.rows.find(r=>r.row===234);
  const model = cupSource.events.find(e=>/U9\b/.test(e.name));
  if (!String(model.image).startsWith('https://storage.googleapis.com/gathr-uploaded-images/')) throw Error('U9 hero is not a first-party managed source image');
  const heroResponse = await fetch(model.image,{method:'HEAD'});
  if (!heroResponse.ok || !String(heroResponse.headers.get('content-type')||'').startsWith('image/')) throw Error('U9 managed source image is unavailable');
  const base = byPath.get(paths.u13).data();
  const name = 'Souris Community Cup U9 Development Camp';
  const create = {...base,...series,name,eventName:name,description:cupDescription('U9'),category:'Sports',eventType:'sports',isEvent:'Yes',isFoodSpecial:'No',startDate:'2026-10-13',endDate:'2026-10-13',startTime:'16:20',endTime:'',ticketPrice:'Free',price:'Free',
    image:model.image,imageUrl:model.image,relevantImageUrl:model.relevantImageUrl,mediaUrls:[model.image],imageProvenance:model.imageProvenance,
    timeFlags:{start:{source:'explicit',evidence:'420 - u9 players'},end:{source:'none',evidence:'',toClose:false}},timeResolution:{hoursUsed:false,reason:'no_end_printed_in_source'},
    sourceUniqueId:cupSource.id,sourceUniqueIds:[cupSource.id],_sourceType:cupSource.stage3[0]._sourceType||'event',sourceTimestamp:admin.firestore.Timestamp.fromDate(new Date(cupSource.timestamp))};
  create.uniqueId = buildExpandedEventStoredUniqueId({row:{uniqueId:cupSource.id},item:create,eventName:name,venueName:base.establishment});
  for (const key of ['createdAt','updatedAt','lastSeenAt','id']) delete create[key];
  changes.push({action:'create',path:paths.u9,data:encode(create),reason:'Add the missing U9 16:20 weekly series; no unprinted end supplied'});
  for (const [key,id] of [['karaoke','3C9dqy'],['comedy','O4FDKN']]) {
    const original = fixtures.audits.find(a=>a.path.includes(id)).before;
    const current = byPath.get(paths[key]).data();
    if (current.uniqueId!==original.uniqueId || current.startDate!==original.startDate) throw Error(`Changed ${key} source`);
    update(key,{isRecurring:true,recurringPattern:'weekly_monday',recurringDaysOfWeek:[],recurringWeekdaySequence:[],recurringWeekInterval:1,totalOccurrences:4,recurrenceUntilDate:'2026-10-26',recurrenceSourceUniqueId:original.uniqueId.split('_')[0]},'Restore the four original Monday occurrences; retain current media and other enrichment');
  }
  const authorBefore = fixtures.audits.find(a=>a.path.includes('SEWO')).before;
  update('author',{category:'Gatherings & Parties',eventType:'gatherings_parties',isEvent:'Yes',isFoodSpecial:'No',endDate:authorBefore.endDate,endTime:authorBefore.endTime,timeFlags:authorBefore.timeFlags,timeResolution:{hoursUsed:false,reason:'restored_previous_end_unknown_source'}},'Restore prior 21:00 end on Oct 22 and literary category. The 21:00 end is prior data, not newly source-verified. Preserve tickets and images.');
  update('council',{category:'Gatherings & Parties',eventType:'gatherings_parties',isEvent:'Yes',isFoodSpecial:'No',endDate:'2026-10-14',endTime:'',timeResolution:{hoursUsed:false,reason:'no_end_printed_in_source'}},'Remove the unsupported 01:00 end and Live Music classification; keep Oct 14 16:30');
  if (byPath.get(paths.drive).data().status!=='needs_review') throw Error('Food drive review status changed');
  update('drive',{category:'Gatherings & Parties',eventType:'gatherings_parties'},'Correct held food-drive category while retaining every spatial review hold; do not publish it');
  const plan = {version:1,projectId:'gathr-migrated',generatedAt:new Date().toISOString(),noLiveWrites:true,changes,
    backup:snaps.map(s=>({path:s.ref.path,exists:s.exists,updateTime:encode(s.updateTime),data:encode(s.data())})),
    cupInventory:cupInventory.docs.map(s=>({path:s.ref.path,data:encode(s.data())}))};
  const file = path.join(out,'live-repair-plan.json');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(file,JSON.stringify(plan,null,2));
  console.log(JSON.stringify({file,updates:changes.filter(c=>c.action==='update').length,creates:1,deletes:0,targets:changes.map(c=>({path:c.path,action:c.action,reason:c.reason}))},null,2));
}
async function applyPlan(file) {
  const plan = JSON.parse(fs.readFileSync(file,'utf8'));
  if (plan.projectId!=='gathr-migrated' || plan.changes.length!==8 || new Set(plan.changes.map(c=>c.path)).size!==8 ||
      plan.changes.some(c=>!Object.values(paths).includes(c.path) || c.action!==(c.path===paths.u9?'create':'update'))) throw Error('Unexpected plan targets');
  await assertIdle();
  // A fresh native-typed backup is written before transaction writes.
  const before = await db.getAll(...plan.changes.map(c=>db.doc(c.path)));
  fs.writeFileSync(path.join(out,`preapply-backup-${Date.now()}.json`),JSON.stringify(before.map(s=>({path:s.ref.path,exists:s.exists,updateTime:encode(s.updateTime),data:encode(s.data())})),null,2));
  await db.runTransaction(async tx=>{
    const snaps = await tx.getAll(...plan.changes.map(c=>db.doc(c.path)));
    const inventory = await tx.get(db.collection(`venues/${cupVenue}/events`));
    if (inventory.docs.some(s=>s.data().startDate==='2026-10-13' && s.data().startTime==='16:20')) throw Error('U9 slot now exists');
    for (let i=0;i<snaps.length;i++) {
      const change=plan.changes[i],snap=snaps[i];
      if(change.action==='create') {if(snap.exists)throw Error('Create target exists');}
      else if(!snap.exists || !snap.updateTime.isEqual(decode(change.updateTime)) || fingerprint(snap.data())!==change.fingerprint)throw Error(`Target drift: ${change.path}`);
    }
    for(const change of plan.changes) {
      const ref=db.doc(change.path),now=admin.firestore.FieldValue.serverTimestamp();
      if(change.action==='create')tx.create(ref,{...decode(change.data),createdAt:now,updatedAt:now,lastSeenAt:now});
      else tx.update(ref,{...decode(change.patch),updatedAt:now});
    }
  });
  const after = await db.getAll(...plan.changes.map(c=>db.doc(c.path)));
  for(let i=0;i<after.length;i++) {
    const change=plan.changes[i],actual=encode(after[i].data()),expected=change.patch||change.data;
    for(const [key,value] of Object.entries(expected)) if(JSON.stringify(actual[key])!==JSON.stringify(value))throw Error(`Postwrite mismatch ${change.path}:${key}`);
  }
  fs.writeFileSync(path.join(out,'live-repair-applied.json'),JSON.stringify({appliedAt:new Date().toISOString(),planFile:path.resolve(file),after:after.map(s=>({path:s.ref.path,updateTime:encode(s.updateTime),data:encode(s.data())}))},null,2));
  console.log(JSON.stringify({applied:8,verified:8,deletes:0}));
}
(async()=>{if(process.argv[2]==='--apply') {if(!process.argv[3])throw Error('Saved approved plan required');await applyPlan(process.argv[3]);}else await buildPlan();})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>admin.app().delete());
