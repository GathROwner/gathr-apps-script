/** Offline conversion of independently reviewed saved-source proposal into exact write plan. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),out=new URL('./artifacts/oct17-festival-corroboration/',import.meta.url);
const proposal=JSON.parse(await fs.readFile('C:/Users/craig/.codex/worktrees/d43e/gathr-apps-script/functions/tmp/oct17-festival-corroboration/proposal.json','utf8'));
const inventory=JSON.parse(await fs.readFile(new URL('functions/artifacts/oct17-corroboration-preflight/live-inventory.json',root),'utf8'));
assert(inventory.readOnly&&inventory.projectId==='gathr-migrated');assert.equal(proposal.capturedAt,inventory.capturedAt);
assert.equal(proposal.effects.sourceCount,145);assert.equal(proposal.effects.eventWrites,0);assert.equal(proposal.effects.paidSources,0);
for(const k of ['publicAdditions','publicRemovals','sourceProvenanceMutations','captureMutations'])assert.deepEqual(proposal[k],[]);
const harvest=proposal.effects.reports.find(r=>r.editionId==='01q4d8wzK8R8VH0revQX');assert.equal(harvest.outcomes.filter(o=>o.status==='corroborated').length,3);assert.equal(harvest.outcomes.filter(o=>o.status==='self_reference').length,1);assert.equal(harvest.outcomes.filter(o=>o.status==='held').length,2);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const entries=new Map(inventory.entries.map(d=>[d.path,d])),paths=new Set(),fileId='1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g';
const pin=p=>{const d=entries.get(p.path);assert(d?.exists,p.path);assert.deepEqual(d.version,p.version,'Pin version '+p.path);assert.equal(hash(d.data),p.fingerprint,'Pin fingerprint '+p.path);paths.add(p.path);};
const operations=proposal.privateDocuments.map(d=>{assert(!entries.get(d.path)?.exists);paths.add(d.path);return{action:'create',path:d.path,payload:d.after};});assert.equal(operations.length,3);
for(const o of operations)for(const r of o.payload.receipts||[]){pin(r.review);pin(r.umbrella);pin(r.canonical);if(r.venueBinding)pin(r.venueBinding.canonical);
 const cp='festival_link_captures/'+r.captureKey;assert(entries.get(cp)?.exists);paths.add(cp);
 const sources=inventory.entries.filter(d=>d.exists&&d.path.startsWith('parse_snapshots/')&&d.data.fileId===fileId&&d.data.uniqueId===r.sourceId);assert.equal(sources.length,1);paths.add(sources[0].path);
}
const batches=inventory.entries.filter(d=>d.exists&&d.path.startsWith('batch_states/')&&d.data.fileId===fileId).sort((a,b)=>Number(b.data.batchNumber)-Number(a.data.batchNumber));
assert(batches.length);const final=batches[0];assert.equal(final.data.status,'completed');assert.equal(final.data.currentRowIndex,367);assert.equal(final.data.totalRows,367);
for(const p of [final.path,'processed_datasets/'+fileId,'processing_locks/'+fileId]){assert(entries.get(p)?.exists);paths.add(p);}
const preconditions=[...paths].sort().map(p=>{const d=entries.get(p);return{path:p,exists:d?.exists||false,sha256:d?.exists?hash(d.data):null,version:d?.version||null};});
const plan={schema:'oct17-festival-reviewed-private-v1',fileId,finalBatchPath:final.path,sourceCapturedAt:inventory.capturedAt,servingBaseline:proposal.servingBaseline,operations,preconditions,publicWrites:0,paidCalls:0};
await fs.mkdir(out,{recursive:true});const bytes=JSON.stringify(plan,null,2);await fs.writeFile(new URL('private-reviewed-plan.json',out),bytes);await fs.writeFile(new URL('reviewed-proposal.json',out),JSON.stringify(proposal,null,2));
console.log(JSON.stringify({status:'prepared_offline',sha256:createHash('sha256').update(bytes).digest('hex'),privateCreates:3,receipts:4,preconditions:preconditions.length,publicWrites:0,liveWrites:0,paidCalls:0}));
