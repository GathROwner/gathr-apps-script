import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
const out='artifacts/recurring-series-hardening-oct14';
const key=JSON.parse(await fs.readFile(process.env.BE_YOU_CREDENTIAL_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const {checkDuplicate}=await import('../lib/services/firestoreService.js');
const capture=JSON.parse(await fs.readFile('artifacts/be-you-oct14/capture.json','utf8'));
const revive=id=>{const row=capture.events.find(x=>x.path.endsWith('/'+id));return {...row.data,id,sourceTimestamp:row.data.sourceTimestamp?._seconds?new Date(row.data.sourceTimestamp._seconds*1000):row.data.sourceTimestamp};};
const deleted=['Uo0EN3ofQfIFbxcYRYwy','mB37Tk3gVTT0zvlkXiPg'];
const retained=['NJ5X8fPIVOy405M9sfFS','PBW360WVRvt9ijTQs9fS','skLvOjG88fMQAxcjUAU0'];
const all=await admin.firestore().collection('venues/name_n2ivcu/events').get();
for(const id of deleted)assert(!all.docs.some(x=>x.id===id),'Deleted ID reappeared');
for(const id of retained)assert(all.docs.some(x=>x.id===id),'Protected ID missing');
const selectors=[];
for(const id of deleted){const result=await checkDuplicate(revive(id),'name_n2ivcu');assert.equal(result.existingEvent?.id,retained[0]);
 selectors.push({historicalSource:id,keeper:result.existingEvent.id,provenanceOnly:Boolean(result.existingEvent._sourceCorroborationOnly)});}
assert(selectors[0].provenanceOnly);
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const details=await Promise.all([...deleted,...retained].map(async id=>{const response=await fetch(`${base}/${id}`,{signal:AbortSignal.timeout(60000)});
 assert.equal(response.status,deleted.includes(id)?404:200,`Unexpected detail ${id}`);return {id,status:response.status};}));
const events=[],seen=new Set();let token,pages=0;
do{const response=await fetch(`${base}?includeExpired=false&limit=100${token?'&startAfter='+encodeURIComponent(token):''}`,{signal:AbortSignal.timeout(60000)});
 assert.equal(response.status,200);const page=await response.json();assert(Array.isArray(page.events));events.push(...page.events);pages++;
 token=page.nextPageToken;if(token){assert(!seen.has(token),'Repeated page token');seen.add(token);}assert(pages<100,'Unexpected pagination bound');
}while(token);
for(const id of deleted)assert(!events.some(x=>x.id===id||x.originalEventId===id||x.id?.startsWith(id+'_')),'Deleted ID in app feed');
const beYou=events.filter(x=>x.venueId==='name_n2ivcu');
for(const id of retained)assert(beYou.some(x=>x.id===id||x.originalEventId===id||x.id?.startsWith(id+'_')),'Protected series absent from active feed');
const result={verifiedAt:new Date().toISOString(),firestoreSiblingCount:all.size,details,pages,feedEvents:events.length,selectors,
 beYou:beYou.map(x=>({id:x.id,originalEventId:x.originalEventId,title:x.title,startDate:x.startDate,startTime:x.startTime,endTime:x.endTime,imageUrl:x.imageUrl})),
 deletedParentsAndInstancesAbsent:true,retainedSeriesPresent:true,liveWrites:0};
await fs.writeFile(`${out}/beyou-api-and-replay-verification.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
await admin.app().delete();
