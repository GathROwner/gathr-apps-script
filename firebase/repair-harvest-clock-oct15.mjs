// One exact existing event; default dry run. No parser replay, uploads or models.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const args=process.argv.slice(2),apply=args.includes('--apply');
const planArg=args.find(a=>a.startsWith('--plan='));
assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));
assert.equal(apply,Boolean(planArg),'Apply requires an exact reviewed plan');
const target='venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W';
const venue='venues/fb_100063617721610';
const source='parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_201_1792070012802';
const sourceId='1727757279354846';
const url='https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/';
const out=path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/harvest');
const plain=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const related=d=>d.ref.path.startsWith(venue+'/events/')||String(d.get('uniqueId')||'').startsWith(sourceId+'_')||(d.get('sourceUniqueIds')||[]).includes(sourceId);
const siblings=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
const patch={startTime:'17:00',endTime:'21:30',endDate:'2026-10-15',
 timeFlags:{start:{source:'explicit',evidence:`venue_website:${url} | Day 1: 5:00–9:30 PM | Chefs’ Harvest Dining Series`},end:{source:'explicit',toClose:false,evidence:`venue_website:${url} | Day 1: 5:00–9:30 PM | Chefs’ Harvest Dining Series`}},
 timeResolution:{hoursUsed:false,reason:'source_verified_named_series_clock',sourceUrl:url}};
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore();
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks repair');
async function website(){
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal(new URL(r.url).hostname,'innatbayfortune.com');
 const html=await r.text();const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/&#8217;|&rsquo;/g,'’').replace(/\s+/g,' ');
 assert(/OCTOBER 15[–-]17\s*\|\s*FORAGER NICK OF NORTH/i.test(text),'Named edition/date evidence changed');
 const match=text.match(/5:00[–-]9:30\s*PM\s*\|\s*Chefs[’']\s*Harvest Dining Series/i);assert(match,'Named dinner clock evidence missing');
 const faq=await fetch('https://innatbayfortune.com/faqs-2/',{signal:AbortSignal.timeout(20000)});assert.equal(faq.status,200);const faqHtml=await faq.text();assert(/October 15 to November 7,?\s*2026/i.test(faqHtml.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')),'Current series year missing');
 return {url,clock:match[0],date:'October 15–17 | Forager Nick of North',year:2026,html,faqHtml};
}
try{
 const [refs,all,locks,evidence]=await Promise.all([db.getAll(db.doc(target),db.doc(venue),db.doc(source)),db.collectionGroup('events').get(),db.collection('processing_locks').get(),website()]);
 idle(locks.docs);assert(refs.every(d=>d.exists));
 assert.equal(refs[0].get('eventName'),'Chefs’ Harvest: The Foraged Seven with Nick of North');
 assert.equal(refs[0].get('startDate'),'2026-10-15');assert.equal(refs[0].get('endDate'),'2026-10-15');assert.equal(refs[0].get('startTime'),'12:30');assert.equal(refs[0].get('endTime'),'21:00');assert.equal(refs[0].get('isRecurring'),'No');assert(!refs[0].get('timing'));
 assert(String(refs[0].get('uniqueId')).startsWith(sourceId+'_'));assert.equal(refs[1].id,'fb_100063617721610');assert.equal(refs[2].get('uniqueId'),sourceId);assert(/Tonight, Chefs[’'] Harvest begins/i.test(refs[2].get('inputText')));
 const relatedBefore=siblings(all.docs);assert.equal(relatedBefore.filter(d=>d.data.uniqueId===refs[0].get('uniqueId')).length,1);
 const capture={target,patch,documents:refs.map(wrap),siblings:relatedBefore,evidence:{url:evidence.url,clock:evidence.clock,date:evidence.date,year:evidence.year}};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 await fs.writeFile(path.join(out,`official-series-${stamp}.html`),evidence.html);await fs.writeFile(path.join(out,`official-year-${stamp}.html`),evidence.faqHtml);
 if(!apply){const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',snapshotHash,backupPath,target,patch,evidence:capture.evidence,preserved:'ID/date/title/venue/category/price/links/description/provenance/all media and siblings'},null,2));console.log(JSON.stringify({planPath,backupPath,target,from:'12:30–21:00',to:'17:00–21:30',guardedReferences:refs.length,venueSourceEvents:relatedBefore.length,liveWrites:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.snapshotHash,snapshotHash,'Reviewed source/target/venue/sibling/evidence drift');assert.equal(plan.target,target);assert.deepEqual(plan.patch,patch);
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);const current=await tx.getAll(...refs.map(d=>d.ref));assert.deepEqual(current.map(wrap),capture.documents,'Reference drift');assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs),relatedBefore,'Sibling drift');tx.update(db.doc(target),{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const fresh=await db.getAll(...refs.map(d=>d.ref));const actual=plain(fresh[0].data()),expected={...capture.documents[0].data,...patch};delete actual.updatedAt;delete expected.updatedAt;assert.deepEqual(actual,expected);fresh.slice(1).forEach((d,i)=>assert.deepEqual(wrap(d),capture.documents[i+1]));
  const appliedPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(appliedPath,JSON.stringify({appliedAt:new Date().toISOString(),backupPath,target,patch,updated:1,mediaWrites:0,expected:actual},null,2));console.log(JSON.stringify({appliedPath,target,updated:1,mediaWrites:0}));
 }
}finally{await admin.app().delete();}
