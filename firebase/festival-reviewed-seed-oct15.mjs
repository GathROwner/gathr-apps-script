// Reviewed, exact internal-only bootstrap. No events, venues, reviews, media or feed writes.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateFestivalEvidenceCapture,FESTIVAL_EVIDENCE_POLICY,festivalEvidenceSourceFingerprint,festivalEvidenceEditionFingerprint} from '../functions/scripts/festival-evidence-extractor.mjs';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const {festivalShadowFingerprint:hash}=require('../functions/lib/services/festivalLinkShadowJob.js');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const root=path.resolve(import.meta.dirname,'../functions/artifacts/festival-linker-oct15'),registry=JSON.parse(await fs.readFile(path.join(root,'followup-registry.json'),'utf8'));
assert.equal(registry.editions.length,1);const edition=registry.editions[0];assert.equal(edition.id,'area_7ebb4bc0846d26c4470e6842');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});const db=admin.firestore();
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?JSON.parse(JSON.stringify(d.data())):null});
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Parser must be idle');
try{
 idle((await db.collection('processing_locks').get()).docs);
 const snapshots=await db.collection('parse_snapshots').where('fileId','==','1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit').get(),sources=new Map();for(const d of snapshots.docs){const id=String(d.get('uniqueId'));if(!sources.has(id)||sources.get(id).updateTime.toMillis()<d.updateTime.toMillis())sources.set(id,d);}
 const changes=[],references=[];let proposedDecision;
 const priorDecision=await fs.readFile(path.join(root,'proposed-nonmember-decision.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
 const reviewedAt=priorDecision?.reviewedAt||new Date().toISOString();
 for(const name of (await fs.readdir(path.join(root,'followup-oct15/evidence'))).sort()){
  if(!name.endsWith('.json'))continue;const c=JSON.parse(await fs.readFile(path.join(root,'followup-oct15/evidence',name),'utf8'));const source=sources.get(c.sourceId);assert(source,'Exact source missing');references.push(wrap(source));
  const caption=source.get('inputText')||'',imageUrls=source.get('rowMeta').mediaUrls,sourceFingerprint=festivalEvidenceSourceFingerprint({caption,imageUrls});
  assert.equal(c.captureKey,hash({source:sourceFingerprint,edition:festivalEvidenceEditionFingerprint(edition),policy:FESTIVAL_EVIDENCE_POLICY}));
  if(c.result){assert.equal(c.result.sourceFingerprint,sourceFingerprint);assert.equal(c.result.editionFingerprint,festivalEvidenceEditionFingerprint(edition));assert.equal(c.result.evidencePolicy,FESTIVAL_EVIDENCE_POLICY);validateFestivalEvidenceCapture(c.result,{caption,imageUrls});const result={...c.result};delete result.rawResponses;changes.push({path:'festival_link_captures/'+c.captureKey,kind:'create',payload:{captureKey:c.captureKey,sourceId:c.sourceId,result,evidenceMode:'historical_response_playback_no_new_paid_calls'}});}
  else{
   assert.equal(c.sourceId,'1512241067607930');assert.equal(c.error,'source_incomplete');assert(caption.toLowerCase().includes('soft internet theory'));
   proposedDecision={version:1,kind:'reviewed_not_member',editionId:edition.id,sourceId:c.sourceId,captureKey:c.captureKey,sourceFingerprint,evidencePolicy:FESTIVAL_EVIDENCE_POLICY,reviewId:'oct15-soft-internet-festival-nonmembership',reason:'Original caption and retained ordered gallery describe the separate Soft Internet Theory exhibition, not an Anchor Fest programme. Fine wall text remains unreadable. Keep the exhibition listing; exclude only festival membership.',reviewedAt};
   changes.push({path:'festival_link_source_decisions/'+c.captureKey,kind:'create',payload:proposedDecision});
  }
 }
 assert.equal(changes.length,7);assert.equal(changes.filter(c=>c.path.startsWith('festival_link_captures/')).length,6);assert(proposedDecision);
 for(const p of [edition.authority.eventPath,edition.authority.reviewPath])references.push(wrap(await db.doc(p).get()));
 const targets=await db.getAll(...changes.map(c=>db.doc(c.path)));assert(targets.every(d=>!d.exists),'Existing private targets require separate review');
 const capture={version:1,changes,references:references.sort((a,b)=>a.path.localeCompare(b.path)),targets:targets.map(wrap),publicWrites:0,paidCalls:0},fingerprint=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backupPath=path.join(root,`seed-${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 if(!apply){const planPath=path.join(root,`seed-plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({status:'proposed_requires_approval',fingerprint,backupPath,changes,publicWrites:0,paidCalls:0},null,2));await fs.writeFile(path.join(root,'proposed-nonmember-decision.json'),JSON.stringify(proposedDecision,null,2));console.log(JSON.stringify({planPath,backupPath,validatedCaches:6,reviewedNonmember:1,publicWrites:0,paidCalls:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.fingerprint,fingerprint,'Approved seed reference drift');assert.deepEqual(plan.changes,changes);
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);const docs=await tx.getAll(...capture.references.map(d=>db.doc(d.path)),...changes.map(c=>db.doc(c.path)));assert.deepEqual(docs.slice(0,capture.references.length).map(wrap),capture.references,'Source or authority drift');assert(docs.slice(capture.references.length).every(d=>!d.exists));for(const c of changes)tx.create(db.doc(c.path),c.payload);});
  const resultPath=path.join(root,`seed-applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({backupPath,changes,publicWrites:0,paidCalls:0},null,2));console.log(JSON.stringify({resultPath,internalCreates:7,publicWrites:0,paidCalls:0}));
 }
}finally{await admin.app().delete();}
