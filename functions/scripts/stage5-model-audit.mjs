// Frozen Stage 4 -> actual production Stage 5 formatting. No live writer or
// other model stages. Use separate child processes because effort is an env setting.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
if (!process.env.OPENAI_API_KEY || !process.env.AUDIT_INPUT || !process.env.AUDIT_OUTPUT) throw Error('Require key, frozen input and output paths');
const [caseId,arm,repeat='1']=process.argv.slice(2);
const arms={'nano-medium':{model:'gpt-5-nano',effort:'medium'},'luna-none':{model:'gpt-6-luna',effort:'none'},'luna-low':{model:'gpt-6-luna',effort:'low'},'luna-medium':{model:'gpt-6-luna',effort:'medium'}};
if(!arms[arm])throw Error('Unknown comparison arm');
const source=JSON.parse(await fs.readFile(process.env.AUDIT_INPUT,'utf8')).find(r=>r.caseId===caseId);
if(!source)throw Error('Unknown source case');
const {model,effort}=arms[arm];
Object.assign(process.env,{DRY_RUN:'true',STAGE5_RESPONSES_REASONING_EFFORT:effort,STAGE5_RESPONSES_MAX_OUTPUT_TOKENS:'32000'});
const requests=[],nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  const address=typeof url==='string'?url:url.url;
  if(address!=='https://api.openai.com/v1/responses')throw Error('Stage 5 audit blocks other endpoints');
  const body=JSON.parse(options.body);
  if(body.model!==model||body.reasoning?.effort!==effort)throw Error('Comparison model/effort mismatch');
  const start=Date.now(),response=await nativeFetch(url,options),data=await response.clone().json();
  const text=(data.output||[]).filter(r=>r.type==='message').flatMap(r=>r.content||[]).filter(r=>r.type==='output_text').map(r=>r.text).join('');
  let raw;try{raw=JSON.parse(text);}catch{}
  requests.push({model,effort,responseId:data.id,httpStatus:response.status,status:data.status,incompleteDetails:data.incomplete_details,error:data.error,
    promptSha256:createHash('sha256').update(JSON.stringify(body.input)).digest('hex'),
    schemaSha256:createHash('sha256').update(JSON.stringify(body.text)).digest('hex'),
    maxOutputTokens:body.max_output_tokens,durationMs:Date.now()-start,usage:data.usage,
    visibleOutputChars:text.length,rawResult:raw,parseError:!raw});
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
const usage=[],started=Date.now();
let events,error;
try{events=await performFinalFormatting(structuredClone(source.items),source.venue,source.address||'',source.timestamp,{
  stage5ModelOverride:model,stage5BatchSize:9,stage5BatchConcurrency:2,lunaCalendarLiteralSourcePrompt:true,
  diagnosticContext:{fileId:'stage5-frozen-comparison',postId:source.postId||caseId,rowIndex:source.row||0,runId:'local-'+repeat},
  gptUsageHandler:record=>usage.push(record),
},source.caption||'');}catch(e){error=e.message;}
const result={caseId,arm,repeat:Number(repeat),model,effort,noLiveWrites:true,sourceSha256:createHash('sha256').update(JSON.stringify(source)).digest('hex'),inputCount:source.items.length,outputCount:events?.length||0,wallMs:Date.now()-started,events,usage,requests,error};
await fs.mkdir(process.env.AUDIT_OUTPUT,{recursive:true});
await fs.writeFile(path.join(process.env.AUDIT_OUTPUT,`${caseId}-${arm}-r${repeat}.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify({caseId,arm,repeat,inputs:result.inputCount,outputs:result.outputCount,wallMs:result.wallMs,calls:requests.length,error}));
