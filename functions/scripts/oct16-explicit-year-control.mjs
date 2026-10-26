// One controlled negative request, no retries/replays/writes.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createStage1EvaluationPrompt,createValidationSchema} from '../lib/parsing/contentValidator.js';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts/oct16-eight-group'),dir=path.join(base,'explicit-year-control');
if(!process.argv.includes('--paid')||fs.existsSync(dir))throw Error('Requires explicit first controlled --paid run');
const previous=JSON.parse(fs.readFileSync(path.join(base,'validation-readback/generation-ledger.json')));if(previous.generationCalls!==10)throw Error('Unexpected prior generation count');fs.mkdirSync(dir);
const prompt=createStage1EvaluationPrompt('Join us for a concert on October 28, 2025, at 8:00 pm. Tickets available at https://example.invalid/events/old-show.',0,'Fixture Venue','2026-10-15T12:00:00Z','compact-v10');
let key=execFileSync('powershell.exe',['-NoProfile','-Command','& gcloud secrets versions access 1 --secret=GATHR_OPENAI_API_KEY --project=gathr-migrated'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const started=Date.now(),response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',reasoning:{effort:'high'},store:false,max_output_tokens:12000,
 text:{format:{type:'json_schema',name:'validateContent',strict:true,schema:createValidationSchema()[0].parameters}},input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})});key='';
const raw=await response.json();fs.writeFileSync(path.join(dir,'raw.json'),JSON.stringify(raw,null,2));
const u=raw.usage||{},d=u.input_tokens_details||{},input=u.input_tokens||0,output=u.output_tokens||0,read=d.cached_tokens||0,write=d.cache_write_tokens||0;
const request={request:11,label:'explicit-expired-year-control',model:'gpt-6-luna',effort:'high',status:raw.status,responseId:raw.id,latencyMs:Date.now()-started,inputTokens:input,outputTokens:output,cachedInputTokens:read,cacheWriteTokens:write,estimatedUsd:((input-read-write)*.10+read*.01+write*.125+output*.50)/1e6};
const result=JSON.parse(raw.output_text||(raw.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join(''));
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({request,result,liveWrites:0},null,2));
const ledger={...previous,generationCalls:11,requests:[...previous.requests,request],total:{...previous.total}};
for(const k of Object.keys(ledger.total))ledger.total[k]+=Number(request[k]||0);
fs.writeFileSync(path.join(base,'generation-ledger-final.json'),JSON.stringify(ledger,null,2));
if(!response.ok||raw.status!=='completed'||result.hasValidContent!==false)throw Error('Explicit old-year negative control failed');
console.log(JSON.stringify({generationCalls:11,result:result.hasValidContent,request,liveWrites:0}));
