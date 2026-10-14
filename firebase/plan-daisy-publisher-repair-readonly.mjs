import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../functions/package.json',import.meta.url));const admin=require('firebase-admin');
if(process.argv.includes('--apply'))throw new Error('Coordinator owns approved live application');
const credential=JSON.parse(await fs.readFile(process.env.DAISY_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});const db=admin.firestore();
const captured=JSON.parse(await fs.readFile(new URL('../functions/artifacts/daisy-oct14/capture.json',import.meta.url),'utf8'));
const source='1738543821054078',expectedPaths=['venues/slug_peifoodies/events/L6dOyFMhpOWTcZSdwPfh','venues/slug_peifoodies/events/krhMcNCxV2s5sM7m26si'];
const [sources,venue,locks]=await Promise.all([db.collectionGroup('events').where('uniqueId','>=',source+'_').where('uniqueId','<',source+'_\uf8ff').get(),
 db.doc('venues/slug_peifoodies').get(),db.collection('processing_locks').get()]);
assert(!locks.docs.some(d=>['running','processing','active'].includes(d.data().status)),'Active parse');
const pack=d=>({path:d.ref.path,updateTime:d.updateTime.toDate().toISOString(),data:d.data()});const docs=sources.docs.map(pack);
assert.deepEqual(docs.map(x=>x.path).sort(),expectedPaths.sort(),'Source sibling drift');
for(const doc of docs){const old=captured.events.find(x=>x.path===doc.path);assert(old);assert.equal(doc.updateTime,old.updateTime,'Target version drift');
 assert.equal(doc.data.eventName,'Burger Basket Day (Burger Basket)');assert.equal(doc.data.venueId,'slug_peifoodies');assert.equal(doc.data.startTime,'11:00');assert.equal(doc.data.endTime,'21:00');assert(['weekly_monday','weekly_wednesday'].includes(doc.data.recurringPattern));assert.equal(doc.data.uniqueId,old.data.uniqueId);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve('firebase/artifacts/daisy-oct14');await fs.mkdir(out,{recursive:true});
const backupPath=path.join(out,`backup-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify({checkedAt:new Date().toISOString(),project:'gathr-migrated',venue:pack(venue),events:docs},null,2));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plan={mode:'DRY_RUN_ONLY',project:'gathr-migrated',backupPath,createdAt:new Date().toISOString(),
 actions:docs.map(x=>({path:x.path,action:'delete',expectedUpdateTime:x.updateTime,contentHash:hash(x.data)})),
 sourceSiblingHash:hash(docs),publisherVersionGuard:{path:venue.ref.path,updateTime:venue.updateTime.toDate().toISOString(),contentHash:hash(venue.data())},
 sourceEvidence:{outerSource:source,originalAuthor:'Daisy’s Dairy Bar and Grill',originalAuthorUrl:'https://www.facebook.com/people/Daisys-Dairy-Bar-and-Grill/61575935160163/',originalTimestamp:'2026-08-10T14:01:10.000Z',rawSourceArtifact:'functions/artifacts/daisy-oct14/raw-source-row.json'},
 holds:['Do not create or rename any venue. Existing Decker’s identity at 655 Main St is not automatic proof of a canonical Daisy’s venue.',
 'Do not republish the August offer as currently active without owner/location, current schedule/season and actual time review. The original post gives weekdays and price, no clock.',
 'Retain source media and all unrelated events. No Be You or other pending plan is included.'],
 approval:'Exact coordinator review and live-data approval required. Reread guards, refresh backup, apply approved deletions atomically, verify both details 404 and both parent/generated occurrence IDs absent from complete app feed.'};
const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify(plan,null,2));console.log(JSON.stringify({writes:0,planPath,backupPath,actions:plan.actions.map(x=>({path:x.path,action:x.action}))}));
