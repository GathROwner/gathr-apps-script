// Reapply current deterministic capture checks to saved paid raw responses.
// This is explicitly offline playback: no new model calls or latency evidence.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {extractFestivalEvidence,FESTIVAL_EVIDENCE_POLICY,festivalEvidenceSourceFingerprint,festivalEvidenceEditionFingerprint} from './festival-evidence-extractor.mjs';
import {festivalShadowFingerprint} from '../lib/services/festivalLinkShadowJob.js';
const args=process.argv.slice(2),opt=n=>args.find(x=>x.startsWith(`--${n}=`))?.slice(n.length+3);
const registry=JSON.parse(await fs.readFile(opt('registry'),'utf8')),edition=registry.editions.find(e=>e.id===opt('edition-id'));assert(edition,'Known reviewed edition required');
const input=path.resolve(opt('trial-dir')),out=path.resolve(opt('out'));await fs.mkdir(out,{recursive:true});const reports=[];
for(const file of await fs.readdir(input)){
 if(!/^[A-Za-z0-9_-]+\.json$/.test(file)||file==='summary.json')continue;
 const previous=JSON.parse(await fs.readFile(path.join(input,file),'utf8'));if(!previous.result?.rawResponses?.length)continue;
 const {caption,imageUrls,id}=previous.capture;assert.equal(previous.result.sourceFingerprint,festivalEvidenceSourceFingerprint({caption,imageUrls}));assert.equal(previous.result.editionFingerprint,festivalEvidenceEditionFingerprint(edition));
 let index=0;
 const result=await extractFestivalEvidence({caption,imageUrls,edition,apiKey:'offline-playback-not-a-key',verify:true,fetchImpl:async()=>{
  const raw=previous.result.rawResponses[index++];assert(raw,'Missing saved response');return new Response(JSON.stringify(raw),{status:200,headers:{'x-gathr-offline-replay':'1'}});
 }});
 const captureKey=festivalShadowFingerprint({source:result.sourceFingerprint,edition:result.editionFingerprint,policy:FESTIVAL_EVIDENCE_POLICY});
 await fs.writeFile(path.join(out,`${captureKey}.json`),JSON.stringify({captureKey,sourceId:id,offlineRawResponsePlayback:true,originalTrial:path.join(input,file),result},null,2));
 reports.push({id,activities:result.activities.length,confirmed:result.activities.filter(x=>x.verification?.accepted).length,newModelCalls:0,offlineRawResponsePlayback:true});
}
console.log(JSON.stringify(reports));
