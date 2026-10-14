import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));const admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.DAISY_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const ids=['L6dOyFMhpOWTcZSdwPfh','krhMcNCxV2s5sM7m26si'];const db=admin.firestore();
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
try{
 for(const id of ids)assert(!(await db.doc('venues/slug_peifoodies/events/'+id).get()).exists);
 assert((await db.doc('venues/fb_100063590381790').get()).exists,'Decker venue missing');assert((await db.doc('venues/slug_peifoodies').get()).exists,'Publisher venue missing');
 const details=await Promise.all(ids.map(async id=>{const r=await fetch(base+'/'+id,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,404,id);return {id,status:r.status};}));
 const events=[],tokens=new Set();let token,pages=0;
 do{const r=await fetch(base+'?includeExpired=false&limit=100'+(token?'&startAfter='+encodeURIComponent(token):''),{signal:AbortSignal.timeout(60000)});
   assert.equal(r.status,200);const page=await r.json();assert(Array.isArray(page.events));events.push(...page.events);pages++;token=page.nextPageToken;
   if(token){assert(!tokens.has(token));tokens.add(token);}assert(pages<100);
 }while(token);
 for(const id of ids)assert(!events.some(x=>x.id===id||x.originalEventId===id||x.id?.startsWith(id+'_')),'Deleted parent/instance remains in active feed');
 const result={verifiedAt:new Date().toISOString(),details,pages,feedEvents:events.length,deletedParentsAndInstancesAbsent:true,publisherAndDeckersVenuesRemain:true,liveWrites:0};
 await fs.writeFile(path.resolve(import.meta.dirname,'../functions/artifacts/daisy-oct14/cleanup-api-verified.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await admin.app().delete();}
