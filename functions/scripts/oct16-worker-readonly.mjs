// Actual worker, real current read-only database, explicitly synthetic local
// capture wrapper. No generation, job writes, publication or event replay.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'artifacts/oct16-eight-group'),assembly=path.join(base,'worker-assembly');
const require=createRequire(path.join(root,'package.json')),admin=require('firebase-admin');
const credential=process.env.ANCHOR_CREDENTIAL_PATH;if(!credential||path.resolve(credential).toLowerCase()!==path.resolve('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json').toLowerCase())throw Error('Existing credential path required');
const account=JSON.parse(fs.readFileSync(credential));if(account.project_id!=='gathr-migrated')throw Error('Project mismatch');admin.initializeApp({credential:admin.credential.cert(account),projectId:'gathr-migrated'});const db=admin.firestore();
const module=await import(pathToFileURL(path.join(assembly,'lib/services/festivalLinkWorker.js')).href),registry=await import(pathToFileURL(path.join(assembly,'lib/services/festivalEditionRegistry.js')).href),shadow=await import(pathToFileURL(path.join(assembly,'lib/services/festivalLinkShadowJob.js')).href),extractor=await import(pathToFileURL(path.join(assembly,'scripts/festival-evidence-extractor.mjs')).href);
const paths=['events/area_7ebb4bc0846d26c4470e6842','events/local_pumpkin_2026','festival_link_publications/local_pumpkin_2026','festival_link_jobs/88c65c91dc325a0eb0159f12d12c72ce5730109587d2994301c60871b70e139d'];
const snap=docs=>docs.map(d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?.toDate().toISOString(),data:d.data()}));
const before=snap(await db.getAll(...paths.map(p=>db.doc(p)))),event=before[0],reviewDoc=await db.doc('city_level_event_reviews/'+event.data.cityLevelReviewId).get();
const edition=registry.reviewedFestivalEdition({path:event.path,data:event.data},{path:reviewDoc.ref.path,data:reviewDoc.data()},'2026-10-16');if(!edition)throw Error('Reviewed edition unavailable');
const sourceDocs=await db.collection('parse_snapshots').where('fileId','==','1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw').where('uniqueId','==','1565799665587565').get();
if(sourceDocs.size!==1)throw Error('Exact source ambiguity');const source=sourceDocs.docs[0].data(),identity={caption:source.inputText,imageUrls:source.rowMeta.mediaUrls};
const controlled=JSON.parse(fs.readFileSync(path.join(base,'additional-validation/summary.json'))).results.find(x=>x.capture)?.capture;if(!controlled)throw Error('Controlled independently verified capture missing');
if(controlled.sourceFingerprint!==extractor.festivalEvidenceSourceFingerprint(identity)||controlled.evidencePolicy!==extractor.FESTIVAL_EVIDENCE_POLICY)throw Error('Original source or policy changed');
const result=structuredClone(controlled);
// This is a declared test wrapper, not a relabelled persisted capture or a
// publication candidate. Original paid title/date/clock quotations are intact.
result.editionFingerprint=extractor.festivalEvidenceEditionFingerprint(edition);
const key=shadow.festivalShadowFingerprint({source:extractor.festivalEvidenceSourceFingerprint(identity),edition:extractor.festivalEvidenceEditionFingerprint(edition),policy:extractor.FESTIVAL_EVIDENCE_POLICY});
const localCaptures=new Map([[key,{captureKey:key,sourceId:source.uniqueId,result}]]);
const readonly=new Proxy(db,{get(target,property){if(['runTransaction','batch','bulkWriter'].includes(String(property)))return()=>{throw Error('Live write forbidden in read-only worker validation');};const value=target[property];return typeof value==='function'?value.bind(target):value;}});
const reports=[];
for(const editionId of [edition.id,'local_pumpkin_2026'])reports.push(await module.runFestivalLinkWorker(readonly,{mode:'publish',dryRun:true,fileId:'1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw',editionId,asOf:'2026-10-16',localCaptures}));
const after=snap(await db.getAll(...paths.map(p=>db.doc(p))));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Protected live state changed during read-only evaluation');
const count=d=>(d.areaData?.locations||[]).flatMap(x=>x.linkedEventIds||[]).length;
const output={syntheticLocalWrapper:true,paidOriginalEditionInput:'fixture-anchor with identical name/year/window',realReviewedEdition:edition.id,originalSourceFingerprint:result.sourceFingerprint,
  captureKey:key,protectedAnchorLinks:count(event.data),protectedPumpkinLinks:count(before[1].data),pumpkinOwnershipProofs:Object.keys(before[2].data?.proofs||{}).length,protectedVersionsUnchanged:true,modelGenerationCalls:0,liveWrites:0,reports};
fs.writeFileSync(path.join(base,'worker-actual-readonly.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({protectedAnchorLinks:output.protectedAnchorLinks,protectedPumpkinLinks:output.protectedPumpkinLinks,pumpkinOwnershipProofs:output.pumpkinOwnershipProofs,reports:reports.map(r=>({status:r.status,reports:r.reports?.map(x=>({editionId:x.editionId,status:x.status,reason:x.reason,added:x.addedEventIds,gaps:x.gaps}))})),liveWrites:0}));
await admin.app().delete();
