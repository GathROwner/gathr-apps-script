// Independent verification only: no uploads, model calls or Firestore mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

assert.equal(process.argv.length,3,'Explicit applied-result path required');
const resultPath=path.resolve(process.argv[2]);
const result=JSON.parse(await fs.readFile(resultPath,'utf8'));
const before=JSON.parse(await fs.readFile(result.backup,'utf8'));
const venueId='1MYRGigRnV8KbuEigjMg',sourceId='122305763552019252';
const id='oct15_fin_122305763552019252_dc008c031ae01b13';
assert.equal(result.target,`venues/${venueId}/events/${id}`);
assert.equal(result.created,1);
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),plain=x=>JSON.parse(JSON.stringify(x));
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);return r.json();};
const feed=async params=>{
 const events=[],seen=new Set();let cursor='',pages=0;
 do{const url=new URL(api);for(const[k,v]of Object.entries({includeExpired:'false',limit:'100',...params}))url.searchParams.set(k,v);if(cursor)url.searchParams.set('startAfter',cursor);
  const page=await get(url);assert(Array.isArray(page.events));events.push(...page.events);cursor=page.nextPageToken||'';assert(++pages<100,'Pagination bound');if(cursor){assert(!seen.has(cursor),'Repeated cursor');seen.add(cursor);}
 }while(cursor);
 return {events,pages};
};
const matches=e=>e.id===id||e.originalEventId===id||String(e.id).startsWith(id+'_');
const checkOccurrence=(e,date)=>{
 assert.equal(e.title,'Thursday Fish Tacos');assert.equal(e.venueId,venueId);
 assert.equal(e.startDate,date);assert.equal(e.endDate,date);assert.equal(e.startTime,'07:00');assert.equal(e.endTime,'20:00');
 assert.equal(e.price,'$7 each (fish tacos)');assert.equal(e.imageUrl,result.media.imageUrl);
 assert.deepEqual(e.metadata.sourceUniqueIds,[sourceId]);assert.deepEqual(e.metadata.sourceUrls,result.payload.sourceUrls);
 assert.equal(e.metadata.timeResolution.endFromHours,'to_close');assert.equal(e.metadata.timeFlags.end.toClose,true);
 assert.equal(e.metadata.imageProvenance.primarySource,'post_media');assert.equal(e.metadata.imageProvenance.primaryUrl,result.media.imageUrl);
 assert(!e.metadata.timing,'No pinned v2 timing');assert.equal(e.description,result.payload.description);
};
try{
 const untouched=[...before.documents.filter(d=>d.path!==result.target),...before.siblings];
 const [target,refs,all,locks]=await Promise.all([db.doc(result.target).get(),db.getAll(...untouched.map(d=>db.doc(d.path))),db.collectionGroup('events').get(),db.collection('processing_locks').get()]);
 assert(target.exists);const actual=plain(target.data());delete actual.createdAt;delete actual.updatedAt;assert.deepEqual(actual,result.payload,'Exact created payload');
 refs.forEach((d,i)=>assert.deepEqual(wrap(d),untouched[i],'Untouched reference '+d.ref.path));
 const related=all.docs.filter(d=>d.ref.path.startsWith(`venues/${venueId}/events/`)||String(d.get('uniqueId')||'').startsWith(sourceId+'_')||(d.get('sourceUniqueIds')||[]).includes(sourceId));
 assert.deepEqual(related.filter(d=>d.ref.path!==result.target).map(wrap).sort((a,b)=>a.path.localeCompare(b.path)),before.siblings,'Exact sibling membership');
 assert.equal(related.filter(d=>(d.get('sourceUniqueIds')||[]).includes(sourceId)||String(d.get('uniqueId')||'').startsWith(sourceId+'_')).length,1,'Only one exact-source parent');
 assert.equal(related.filter(d=>/taco/i.test(d.get('eventName')||d.get('name')||'')).length,1,'Only one taco parent');
 const activeLocks=locks.docs.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||'')));assert.equal(activeLocks.length,0);
 const detail=await get(api+'/'+id);checkOccurrence(detail.event,'2026-10-15');assert.equal(detail.event.isRecurring,true);assert.equal(detail.event.recurringPattern,'weekly_thursday');
 const full=await feed({});const projected=full.events.filter(matches);assert(projected.length>0,'Missing active feed occurrence');
 const byDate=new Map();for(const e of projected){checkOccurrence(e,e.startDate);assert.equal(new Date(e.startDate+'T12:00:00Z').getUTCDay(),4);assert(!byDate.has(e.startDate),'Duplicate occurrence date');byDate.set(e.startDate,e.id);}
 assert(byDate.has('2026-10-15'),'Today absent from active feed');
 for(const e of full.events.filter(e=>e.venueId===venueId&&/taco/i.test(e.title||'')))assert(matches(e),'Unexpected taco duplicate');
 // The separate venueId-filtered API query currently requires a missing composite
 // index. Date-filtered complete feeds exercise the same recurrence projection;
 // filter the target identity locally without changing production indexes.
 const next=await feed({startDate:'2026-10-22',endDate:'2026-10-22'});const nextMatches=next.events.filter(matches);assert.equal(nextMatches.length,1);checkOccurrence(nextMatches[0],'2026-10-22');assert.equal(nextMatches[0].id,id+'_20261022');assert.equal(nextMatches[0].originalEventId,id);assert.equal(nextMatches[0].isRecurringInstance,true);
 const offDay=await feed({startDate:'2026-10-21',endDate:'2026-10-21'});assert.equal(offDay.events.filter(matches).length,0);
 const imageResponse=await fetch(result.media.imageUrl,{signal:AbortSignal.timeout(30000)});assert.equal(imageResponse.status,200);assert(imageResponse.headers.get('content-type')?.startsWith('image/'));const posterPath=path.join(path.dirname(resultPath),'managed-poster.webp');await fs.writeFile(posterPath,Buffer.from(await imageResponse.arrayBuffer()));
 const priorImages=[...new Set(untouched.flatMap(d=>[d.data?.imageUrl,d.data?.image,d.data?.relevantImageUrl,d.data?.profileImage,d.data?.profileImageUrl]).filter(v=>typeof v==='string'&&v.startsWith('https://storage.googleapis.com/gathr-uploaded-images/')))];
 const priorMedia=await Promise.all(priorImages.map(async url=>({url,status:(await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)})).status})));assert(priorMedia.every(m=>m.status===200),'Pre-existing managed image unavailable');
 const verified={verifiedAt:new Date().toISOString(),resultPath,target:result.target,exactPayloadVerified:true,untouchedReferences:untouched.length,unchangedEventSiblings:before.siblings.length,sourceParents:1,tacoParents:1,activeParserLocks:0,detail200:true,feedTotal:full.events.length,feedPages:full.pages,occurrences:Object.fromEntries(byDate),nextThursday:nextMatches[0],nextThursdayFeedTotal:next.events.length,nextThursdayFeedPages:next.pages,nonThursdayAbsent:true,managedPoster200:true,posterPath,priorMedia,observations:['Separate venueId-filtered feed query returns 500 FAILED_PRECONDITION for a missing composite index; recurrence verified through fully paginated date-filtered global feeds.'],liveWrites:0};
 const out=path.join(path.dirname(resultPath),'independent-verification-2026-10-15.json');await fs.writeFile(out,JSON.stringify(verified,null,2));
 console.log(JSON.stringify({out,exactPayloadVerified:true,untouchedReferences:untouched.length,unchangedEventSiblings:before.siblings.length,feedTotal:full.events.length,feedPages:full.pages,occurrences:Object.fromEntries(byDate),nextThursdayVerified:true,nonThursdayAbsent:true,managedPoster200:true,priorMedia200:priorMedia.length,liveWrites:0}));
}finally{await admin.app().delete();}
