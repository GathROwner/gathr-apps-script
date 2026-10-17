// Actual saved capture/live inventory tests; network and writes are forbidden.
import './prepare-proposal.mjs';
import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FrozenDatabase} from './frozen-database.mjs';
const require=createRequire(new URL('./assembly/package.json',import.meta.url));
const {runFestivalLinkWorker}=require('./lib/services/festivalLinkWorker.js');
const proposal=JSON.parse(await fs.readFile(new URL('./proposal.json',import.meta.url),'utf8'));
const inventory=JSON.parse(await fs.readFile(proposal.inventoryPath,'utf8'));
const options={mode:'publish',dryRun:true,asOf:'2026-10-17',fileId:'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g'};
const edition='01q4d8wzK8R8VH0revQX',photo='venues/slug_foundersfoodhall/events/oct16harvest_photobooth_20261017_1500';
const site=proposal.privateDocuments.find(d=>d.path.startsWith('festival_website_evidence/')).path;
const gallery=proposal.privateDocuments.find(d=>d.after.receipts?.length===3).path;
function database(){const db=new FrozenDatabase(inventory.entries);for(const d of proposal.privateDocuments)db.entries.set(d.path,{path:d.path,version:{seconds:1792267200,nanoseconds:0},data:structuredClone(d.after)});return db;}
async function run(db){const report=await runFestivalLinkWorker(db,options);assert.equal(report.eventWrites,0);assert.equal(report.paidSources,0);assert.equal(db.writes.length,0);assert(report.reports?.every(r=>r.addedEventIds.length===0)||report.status==='source_evidence_not_captured');return report;}
const harvest=r=>r.reports.find(x=>x.editionId===edition);
test('145-source actual worker replay is idempotent and source/receipt order independent',async()=>{const db=database(),before=JSON.stringify([...db.entries]);const a=await run(db),b=await run(db);assert.deepEqual(a,b);assert.equal(JSON.stringify([...db.entries]),before);db.entries=new Map([...db.entries].reverse());db.entries.get(gallery).data.receipts.reverse();const byEdition=r=>[...r.reports].sort((x,y)=>x.editionId.localeCompare(y.editionId));assert.deepEqual(byEdition(await run(db)),byEdition(a));const h=harvest(a);assert.equal(h.outcomes.filter(o=>o.status==='corroborated').length,3);assert.equal(h.outcomes.filter(o=>o.status==='self_reference').length,1);assert.equal(h.outcomes.filter(o=>o.status==='held').length,2);assert.equal(a.reports.find(x=>x.editionId==='area_7ebb4bc0846d26c4470e6842').outcomes.filter(o=>o.status==='held').length,22);});
test('missing historical child and later recreation with a new version stay held until reviewed again',async()=>{const db=database(),saved=db.entries.get(photo);db.entries.delete(photo);assert.equal(harvest(await run(db)).outcomes.find(o=>o.candidatePaths.includes(photo))?.status,undefined);db.entries.set(photo,{...saved,version:{...saved.version,nanoseconds:saved.version.nanoseconds+1}});assert(!harvest(await run(db)).outcomes.some(o=>o.status==='corroborated'&&o.candidatePaths.includes(photo)));});
const changes={
 'changed website raw body':db=>{db.entries.get(site).data.httpBody+='changed';},
 'changed website normalized body':db=>{db.entries.get(site).data.body+='changed';},
 'changed header year':db=>{db.entries.get(gallery).data.receipts[0].website.header.year=2025;},
 'canonical clock drift':db=>{db.entries.get(photo).data.endTime='18:00';},
 'canonical version drift':db=>{db.entries.get(photo).version.nanoseconds++;},
 'duplicate candidate':db=>{db.entries.set('venues/slug_foundersfoodhall/events/duplicate_fixture',{...structuredClone(db.entries.get(photo)),path:'venues/slug_foundersfoodhall/events/duplicate_fixture'});},
 'disabled child':db=>{db.entries.get(photo).data.disabled=true;},
 'manual publication suppression':db=>{db.entries.get('festival_link_publications/'+edition).data.suppressedEventIds.push(photo.split('/').at(-1));},
 'canonical venue drift':db=>{db.entries.get('venues/slug_foundersfoodhall').data.name='Different venue';},
 'source snapshot revision drift':db=>{[...db.entries.values()].find(x=>x.path.startsWith('parse_snapshots/')&&x.data.fileId===options.fileId&&x.data.uniqueId==='1725796586222521').version.nanoseconds+=1000000;},
};
for(const[name,change]of Object.entries(changes))test('actual worker '+name+' remains closed',async()=>{const db=database();change(db);const h=harvest(await run(db));assert(h.outcomes.some(o=>o.reason==='invalid_reviewed_corroboration'));});
test('new source gallery requires its own exact capture and receipt, with zero paid work in dry run',async()=>{const db=database();[...db.entries.values()].find(x=>x.path.startsWith('parse_snapshots/')&&x.data.fileId===options.fileId&&x.data.uniqueId==='1725796586222521').data.rowMeta.mediaUrls.reverse();assert.equal((await run(db)).status,'source_evidence_not_captured');});
test('a negative independent model receipt is never overridden by the website receipt',async()=>{const db=database(),capturePath='festival_link_captures/'+gallery.split('/').at(-1),a=db.entries.get(capturePath).data.result.activities.find(a=>a.name==='PHOTO BOOTH');a.modelVerification={...a.modelVerification,accepted:false,reason:'negative retained verifier control'};a.verification={...a.modelVerification};const h=harvest(await run(db));assert.equal(h.unconfirmedItems.length,1);assert.equal(h.outcomes.filter(o=>o.status==='corroborated').length,2);assert(!h.outcomes.some(o=>o.status==='corroborated'&&o.candidatePaths.includes(photo)));});
