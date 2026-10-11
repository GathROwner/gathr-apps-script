// Read-only verification of the approved October 11 data repair.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const root = path.resolve(__dirname, '../artifacts/luna-oct11-integrity-repair');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'live-repair-plan.json'), 'utf8'));
const preflight = JSON.parse(fs.readFileSync(path.join(root, 'live-preflight.json'), 'utf8'));
const key = JSON.parse(fs.readFileSync('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId:key.project_id});
const db = admin.firestore();
const base = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app';
const idOf = target => target.path.split('/').at(-1);
const familyOf = event => event.originalEventId || event.id;
async function get(route) {
  const response = await fetch(base + route, {signal:AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, route);
  return response.json();
}
(async()=>{
  const details = await Promise.all(plan.changes.filter(c=>c.path.startsWith('venues/')).map(async change=>{
    const event = (await get(`/api/v2/firestore/events/${idOf(change)}`)).event;
    const patch = change.patch || change.data;
    for (const field of ['category','startDate','startTime','endDate','endTime','recurringPattern']) {
      if (field in patch) assert.equal(event[field], patch[field], `${event.id}:${field}`);
    }
    if (patch.eventName) assert.equal(event.title,patch.eventName,event.id);
    if (patch.totalOccurrences) assert.equal(event.metadata.totalOccurrences,patch.totalOccurrences,event.id);
    if (patch.recurrenceUntilDate) assert.equal(event.metadata.recurrenceUntilDate,patch.recurrenceUntilDate,event.id);
    const before = plan.backup.find(b=>b.path===change.path)?.data;
    if (before?.externalLinks?.length) assert.deepEqual(event.metadata.externalLinks,before.externalLinks,event.id);
    if (before?.ticketUrl) assert.equal(event.metadata.ticketUrl,before.ticketUrl,event.id);
    return {id:event.id,title:event.title,category:event.category,startDate:event.startDate,startTime:event.startTime,endTime:event.endTime};
  }));
  const feed=[]; const seen=new Set(); let token; let pages=0;
  do {
    assert.ok(pages<30,'Feed pagination exceeded safe bound');
    const page=await get(`/api/v2/firestore/events?includeExpired=false&limit=100${token?'&startAfter='+encodeURIComponent(token):''}`);
    feed.push(...page.events); pages++;
    token=page.nextPageToken;
    if(token) {assert.ok(!seen.has(token),'Repeated feed cursor');seen.add(token);}
  } while(token);
  const occurrences=[];
  for(const change of plan.changes.filter(c=>c.path.startsWith('venues/'))) {
    const id=idOf(change),events=feed.filter(e=>familyOf(e)===id);
    assert.ok(events.length>0,`${id} missing from app feed`);
    const patch=change.patch||change.data;
    if(patch.recurringPattern==='weekly_tuesday') {
      assert.ok(events.some(e=>e.startDate==='2026-10-13'),`${id} first camp occurrence`);
      assert.ok(events.every(e=>['2026-10-13','2026-10-20','2026-10-27'].includes(e.startDate)),`${id} unexpected camp date`);
      const expectedTime=patch.startTime||preflight.events.find(e=>e.path===change.path).data.startTime;
      assert.ok(events.every(e=>e.startTime===expectedTime),`${id} slot clock`);
    }
    if(patch.recurringPattern==='weekly_monday') {
      assert.ok(events.some(e=>e.startDate==='2026-10-12'),`${id} next Monday`);
      assert.ok(events.every(e=>['2026-10-12','2026-10-19','2026-10-26'].includes(e.startDate)),`${id} unexpected Monday`);
    }
    occurrences.push({id,dates:events.map(e=>e.startDate).sort()});
  }
  const drive=plan.changes.find(c=>c.path.startsWith('city_level_event_reviews/'));
  const driveNow=(await db.doc(drive.path).get()).data();
  const driveBefore=plan.backup.find(b=>b.path===drive.path).data;
  assert.equal(driveNow.status,'needs_review');
  assert.equal(driveNow.category,'Gatherings & Parties');
  for(const [field,value] of Object.entries(driveBefore).filter(([key])=>/hold|review|location|spatial/i.test(key))) assert.deepEqual(JSON.parse(JSON.stringify(driveNow[field])),value,`held drive:${field}`);
  assert.ok(!feed.some(e=>familyOf(e)===idOf(drive)),'Held food drive was published');
  const controls=[];
  for(const id of ['8WD9DcZTLgEBYnqnZNtm','PMLIVM9n9zyehj5tuHMA','LFEXYZ7jGdqEnltJpe8u']) {
    const before=preflight.events.find(e=>e.path.endsWith('/'+id)); assert.ok(before,id);
    const snap=await db.doc(before.path).get();
    assert.equal(snap.updateTime.toDate().toISOString(),before.updateTime,`${id} changed`);
    assert.ok(feed.some(e=>familyOf(e)===id),`${id} missing control`);
    controls.push({id,unchanged:true,inFeed:true});
  }
  const result={verifiedAt:new Date().toISOString(),projectId:key.project_id,liveTargets:8,details,occurrences,pages,feedEvents:feed.length,heldFoodDrivePreserved:true,controls,
    coverage:'Detail metadata confirms full bounded series. Feed confirms returned upcoming occurrences; it does not materialize every later recurrence date.'};
  fs.writeFileSync(path.join(root,'live-repair-api-verified.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>admin.app().delete());
