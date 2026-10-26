// Read-only Responses retrieval and reconciliation, zero model generations.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts/oct16-eight-group');
const first=JSON.parse(fs.readFileSync(path.join(base,'paid-evaluation/summary.json'))),additional=JSON.parse(fs.readFileSync(path.join(base,'additional-validation/summary.json')));
const logs=fs.readFileSync(path.join(base,'additional-validation-log.txt'),'utf8').split(/\r?\n/).flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
const actual=logs.filter(x=>x.message==='Stage 5 Responses diagnostics').map(x=>x.context);
if(actual.length!==1||first.requestCount!==7||additional.requestCount!==2)throw Error('Unexpected controlled ledger; review before accounting');
const context=actual[0];const stage5={label:'actual-stage5-multi',model:context.model,effort:'none',status:context.responseStatus,
 responseId:context.responseId,latencyMs:context.durationMs,inputTokens:context.inputTokens,outputTokens:context.outputTokens,
 cachedInputTokens:context.cachedInputTokens,cacheWriteTokens:context.cacheWriteTokens,
 estimatedUsd:((context.inputTokens-context.cachedInputTokens-context.cacheWriteTokens)*.10+context.cachedInputTokens*.01+context.cacheWriteTokens*.125+context.outputTokens*.50)/1e6};
const requests=[...first.requests,stage5,...additional.requests].map((x,index)=>({...x,request:index+1}));
let secret=execFileSync('powershell.exe',['-NoProfile','-Command','& gcloud secrets versions access 1 --secret=GATHR_OPENAI_API_KEY --project=gathr-migrated'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const dir=path.join(base,'validation-readback');fs.mkdirSync(dir,{recursive:true});
for(const [name,suffix]of [['response',''],['input-items','/input_items?limit=100']]){
 const response=await fetch('https://api.openai.com/v1/responses/'+context.responseId+suffix,{headers:{Authorization:'Bearer '+secret}}),raw=await response.json();
 fs.writeFileSync(path.join(dir,`multi-stage5-${name}.json`),JSON.stringify({httpStatus:response.status,body:raw},null,2));if(!response.ok)throw Error('Read-only retrieval unavailable '+response.status);
}
secret='';
const summary={generationCalls:requests.length,requests,total:requests.reduce((a,x)=>{
 for(const k of ['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','estimatedUsd','latencyMs'])a[k]+=Number(x[k]||0);return a;
},{inputTokens:0,outputTokens:0,cachedInputTokens:0,cacheWriteTokens:0,estimatedUsd:0,latencyMs:0}),readOnlyRetrievals:2,liveWrites:0,
 note:'The actual SDK call used node-fetch rather than the initial global fetch wrapper. Its independently logged paid usage is reconciled here; no paid call is omitted or replay counted.'};
fs.writeFileSync(path.join(dir,'generation-ledger.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({output:dir,generationCalls:summary.generationCalls,total:summary.total,liveWrites:0}));
