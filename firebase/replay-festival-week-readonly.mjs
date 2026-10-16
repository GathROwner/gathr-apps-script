import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const {runFestivalLinkWorker}=require('../functions/lib/services/festivalLinkWorker.js');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const root=path.resolve('functions/artifacts/festival-week-oct15'),inventory=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
try{
 const reports=[];
 for(const run of inventory.runs.filter(r=>r.gate.ready)){
  const result=await runFestivalLinkWorker(admin.firestore(),{mode:'publish',dryRun:true,asOf:'2026-10-15',fileId:run.fileId});
  assert.equal(result.eventWrites,0);assert.equal(result.paidSources||0,0);
  reports.push(result);console.log(JSON.stringify({fileId:run.fileId,status:result.status,sourceId:result.sourceId,editions:result.reports?.map(r=>({id:r.editionId,status:r.status,additions:r.addedEventIds.length}))}));
 }
 await fs.writeFile(path.join(root,'production-worker-replays.json'),JSON.stringify({checkedAt:new Date().toISOString(),reports,liveWrites:0,paidCalls:0},null,2));
}finally{await admin.app().delete();}
