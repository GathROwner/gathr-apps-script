import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
try{
 const db=admin.firestore(),[events,venues]=await Promise.all([db.collectionGroup('events').get(),db.collection('venues').get()]);
 assert(events.size<15000&&venues.size<5000);
 const ids=['1539985468169427','1723566179778895','1633318801534876'];
 const candidates=events.docs.filter(d=>{
  const e=d.data();return d.id.startsWith('oct14_repair_festival_')||ids.includes(String(e.sourceUniqueId))||ids.some(id=>e.sourceUniqueIds?.includes(id))||/\b(?:Salty Sailors|Vintage 4\.0|Jack Frost|Winterfest)\b/i.test(e.eventName||'');
 }).map(d=>({path:d.ref.path,data:d.data()}));
 const venueIds=new Set(candidates.map(c=>c.data.venueId));
 const result={checkedAt:new Date().toISOString(),candidates,venues:venues.docs.filter(d=>venueIds.has(d.id)).map(d=>({id:d.id,data:d.data()})),liveWrites:0};
 await fs.writeFile('functions/artifacts/festival-week-oct15/canonical.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(candidates.map(c=>({path:c.path,name:c.data.eventName,date:c.data.startDate,time:c.data.startTime,venue:c.data.venueId,sourceUniqueId:c.data.sourceUniqueId,sourceUniqueIds:c.data.sourceUniqueIds})),null,2));
}finally{await admin.app().delete();}
