// Revalidate saved raw extraction AND independent verification responses. No API traffic.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {extractFestivalEvidence} from './festival-evidence-extractor.mjs';
const opt=n=>process.argv.slice(2).find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const inputs=JSON.parse(await fs.readFile(opt('inputs'),'utf8')),out=path.resolve(opt('out'));await fs.mkdir(out,{recursive:true});const reports=[];
for(const input of inputs){
 const previous=JSON.parse(await fs.readFile(input.capture,'utf8'));assert(previous.result?.rawResponses?.length===2,'Full original extraction and verifier responses required');
 const edition=previous.edition||JSON.parse(await fs.readFile(input.edition,'utf8'));let index=0;
 const result=await extractFestivalEvidence({...previous.capture,edition,apiKey:'offline-not-a-key',verify:true,fetchImpl:async()=>{assert(index<2,'Unexpected additional response request');return new Response(JSON.stringify(previous.result.rawResponses[index++]),{headers:{'x-gathr-offline-replay':'1'}});}});assert.equal(index,2);assert(result.requests.every(q=>q.replayed&&q.latencyMs===null));
 const file=path.join(out,previous.capture.id+'.json');await fs.writeFile(file,JSON.stringify({capture:previous.capture,edition,result,offlineOnly:true,originalTrial:input.capture},null,2));
 reports.push({sourceId:previous.capture.id,activities:result.activities.length,confirmed:result.activities.filter(a=>a.verification?.accepted).length,scopeHolds:result.activities.filter(a=>a.captureHoldReason).length,modelRejected:result.activities.filter(a=>!a.modelVerification?.accepted).map(a=>({name:a.name,reason:a.modelVerification?.reason})),sourceScopes:result.activities.filter(a=>a.sourceScope).length,paidCalls:0,liveWrites:0,output:file});
}
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
