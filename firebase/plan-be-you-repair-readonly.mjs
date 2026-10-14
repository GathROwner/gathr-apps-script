// Deliberately read-only. The coordinator owns any approved application.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
if(process.argv.includes('--apply'))throw new Error('Apply is exclusively owned by the coordinator');
const credential=JSON.parse(await fs.readFile(process.env.BE_YOU_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const db=admin.firestore(),venueId='name_n2ivcu',base=`venues/${venueId}/events/`;
const capture=JSON.parse(await fs.readFile(new URL('../functions/artifacts/be-you-oct14/capture.json',import.meta.url),'utf8'));
const history=JSON.parse(await fs.readFile(new URL('../functions/artifacts/be-you-oct14/history.json',import.meta.url),'utf8'));
const targets=[['NJ5X8fPIVOy405M9sfFS','Karaoke Night','2026-09-30','122202851828910683_c6a2578c31e84265'],
 ['Uo0EN3ofQfIFbxcYRYwy','Karaoke Night ✨','2026-05-27','1563147748686067_1'],
 ['mB37Tk3gVTT0zvlkXiPg','Karaoke','2026-10-14','1562661692568029_72f05ef2d5d4041b']];
const [children,roots,locks,venue]=await Promise.all([db.collection('venues').doc(venueId).collection('events').get(),
 db.collection('events').where('venueId','==',venueId).get(),db.collection('processing_locks').get(),db.collection('venues').doc(venueId).get()]);
assert(!locks.docs.some(d=>['processing','running','active'].includes(d.data().status)),'Active parser');
const pack=d=>({path:d.ref.path,updateTime:d.updateTime.toDate().toISOString(),data:d.data()});
const siblings=[...children.docs,...roots.docs].map(pack);
assert.equal(venue.updateTime.toDate().toISOString(),capture.venues[0].updateTime,'Venue version drift');
assert.deepEqual(siblings.map(x=>x.path).sort(),capture.events.map(x=>x.path).sort(),'Sibling inventory drift');
for(const current of siblings){const previous=capture.events.find(x=>x.path===current.path);assert.equal(current.updateTime,previous.updateTime,'Sibling version drift');}
for(const [id,title,date,uniqueId]of targets){const doc=siblings.find(x=>x.path===base+id);assert(doc);assert.equal(doc.data.eventName,title);assert.equal(doc.data.startDate,date);assert.equal(doc.data.startTime,'20:00');assert.equal(doc.data.uniqueId,uniqueId);}
const keeper=siblings.find(x=>x.path===base+targets[0][0]);
assert.equal(keeper.data.recurringPattern,'weekly_wednesday');assert.equal(keeper.data.endTime,'00:00');
const aggregateAudit=history.audits.find(x=>x.data.eventId==='mB37Tk3gVTT0zvlkXiPg');
const sourceRoots=[...new Set([...(keeper.data.sourceUniqueIds||[]),'122202851828910683','1563147748686067','1562661692568029',aggregateAudit.data.uniqueId.split('_')[0]])];
const sourceUrls=[...new Set([...(keeper.data.sourceUrls||[]),'https://www.facebook.com/events/1563147748686067/',aggregateAudit.data.row.topLevelUrl].filter(Boolean))];
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve('firebase/artifacts/be-you-oct14');await fs.mkdir(out,{recursive:true});
const backupPath=path.join(out,`backup-${stamp}.json`);
await fs.writeFile(backupPath,JSON.stringify({capturedAt:new Date().toISOString(),project:'gathr-migrated',venue:pack(venue),siblings},null,2));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plan={mode:'DRY_RUN_ONLY',project:'gathr-migrated',createdAt:new Date().toISOString(),backupPath,
 sourceEvidence:'functions/artifacts/be-you-oct14/history.json and inspected source posters',
 expectedSiblingHash:hash(siblings),venueVersionGuard:{path:venue.ref.path,updateTime:venue.updateTime.toDate().toISOString(),contentHash:hash(venue.data())},versionGuards:siblings.map(x=>({path:x.path,updateTime:x.updateTime,contentHash:hash(x.data)})),
 actions:[{path:keeper.path,action:'update',patch:{sourceUniqueIds:sourceRoots,sourceUrls}},...targets.slice(1).map(x=>({path:base+x[0],action:'delete'}))],
 holds:[{path:base+'PBW360WVRvt9ijTQs9fS',reason:'Sing-along versus karaoke source identity/schedule replacement remains unresolved; retain Wednesday.'},
 {path:base+'skLvOjG88fMQAxcjUAU0',reason:'Friday is explicitly supported by the owner poster; retain.'}],
 intendedFeedResult:'Two Wednesday cards remain: Sing-Along Night and source-verified Karaoke Night. Friday remains. This does not claim karaoke and sing-along are equivalent.',
 approval:'Exact targets and coordinator review/approval required. Coordinator must reread all guards, back up again, atomically apply only approved actions and verify details plus paginated feed.'};
const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify(plan,null,2));
console.log(JSON.stringify({writes:0,planPath,backupPath,actions:plan.actions,holds:plan.holds}));
