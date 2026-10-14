import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const root=new URL('../',import.meta.url);
const read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const backup=await read('functions/artifacts/dedup-oct14/cleanup-backup-2026-10-14T23-29-17-740Z.json');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore();
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const deletes=backup.records.filter(x=>x.action==='delete'),keepers=backup.records.filter(x=>x.action==='update');
try {
 const fresh=await db.getAll(...backup.records.map(x=>db.doc(x.path)));
 fresh.forEach((s,i)=>{const r=backup.records[i];if(r.action==='delete'){assert(!s.exists);return;}
   assert(s.exists);const expected={...r.data,...r.patch},actual=JSON.parse(JSON.stringify(s.data()));delete expected.updatedAt;delete actual.updatedAt;assert.deepEqual(actual,expected,r.path);});
 const untargeted=backup.related.filter(x=>!backup.records.some(r=>r.path===x.path));
 if(untargeted.length){const siblings=await db.getAll(...untargeted.map(x=>db.doc(x.path)));siblings.forEach((s,i)=>assert.deepEqual(JSON.parse(JSON.stringify(s.data())),untargeted[i].data,untargeted[i].path));}
 const details=await Promise.all(backup.records.map(async r=>{const response=await fetch(`${base}/${r.path.split('/').at(-1)}`,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,r.action==='delete'?404:200,r.path);return{path:r.path,status:response.status};}));
 const events=[],seen=new Set();let token='',pages=0;
 do{const url=new URL(base);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');if(token)url.searchParams.set('startAfter',token);
 const res=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(res.ok);const body=await res.json();assert(Array.isArray(body.events));events.push(...body.events);pages++;token=body.nextPageToken||'';if(token){assert(!seen.has(token),'Pagination cycle');seen.add(token);}assert(pages<100);}while(token);
 const matches=(event,id)=>event.id===id||event.originalEventId===id||event.metadata?.originalEventId===id||String(event.id).startsWith(id+'_');
 for(const r of deletes)assert(!events.some(e=>matches(e,r.path.split('/').at(-1))),r.path);
 for(const r of keepers)assert.equal(events.filter(e=>matches(e,r.path.split('/').at(-1))).length,1,r.path);
 const media=await Promise.all([...new Set(backup.records.flatMap(r=>[r.data.imageUrl,r.data.image,r.data.relevantImageUrl,...(r.data.mediaUrls||[])]).filter(x=>typeof x==='string'&&x.startsWith('https://storage.googleapis.com/')))].map(async url=>{const res=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});return{url,status:res.status};}));
 const report={checkedAt:new Date().toISOString(),deleted:deletes.length,keepers:keepers.length,untargetedSiblingsUnchanged:untargeted.length,details,pages,feedEvents:events.length,deletedOccurrences:0,keeperOccurrences:6,media};
 await fs.writeFile(new URL('functions/artifacts/dedup-oct14/cleanup-api-verified.json',root),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,details:undefined,media:media.map(x=>({status:x.status}))}));
}finally{await admin.app().delete();}
