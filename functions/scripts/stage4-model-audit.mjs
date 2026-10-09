// Frozen Stage 3 -> actual Stage 4 validator. No other model stages or writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
if (!process.env.OPENAI_API_KEY || !process.env.AUDIT_INPUT || !process.env.AUDIT_OUTPUT) throw Error('Require key, frozen input and output paths');
const [caseId,arm,repeat='1']=process.argv.slice(2);
const arms={'nano-low':{model:'gpt-5-nano',effort:'low'},'luna-none':{model:'gpt-6-luna',effort:'none'},'luna-low':{model:'gpt-6-luna',effort:'low'},'luna-medium':{model:'gpt-6-luna',effort:'medium'}};
if(!arms[arm])throw Error('Unknown comparison arm');
const source=JSON.parse(await fs.readFile(process.env.AUDIT_INPUT,'utf8')).find(r=>r.caseId===caseId);
if(!source)throw Error('Unknown source case');
const {model,effort}=arms[arm];
Object.assign(process.env,{DRY_RUN:'true',STAGE4_RESPONSES_REASONING_EFFORT:effort,STAGE4_RESPONSES_MAX_OUTPUT_TOKENS:'32000'});
const requests=[],nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  const address=typeof url==='string'?url:url.url;
  if(address!=='https://api.openai.com/v1/responses')throw Error('Stage 4 audit blocks other endpoints');
  const body=JSON.parse(options.body);
  if(body.model!==model||body.reasoning?.effort!==effort)throw Error('Comparison model/effort mismatch');
  const prompt=body.input[0].content[0].text;
  const batchItems=JSON.parse(prompt.split('ITEMS TO VALIDATE:\n')[1].split('\n\nIMPORTANT CONTEXT:')[0]);
  const start=Date.now(),response=await nativeFetch(url,options),data=await response.clone().json();
  const text=(data.output||[]).filter(r=>r.type==='message').flatMap(r=>r.content||[]).filter(r=>r.type==='output_text').map(r=>r.text).join('');
  let raw;try{raw=JSON.parse(normalizeStage4JsonForRegression(text));}catch{}
  requests.push({model,effort,responseId:data.id,httpStatus:response.status,status:data.status,incompleteDetails:data.incomplete_details,error:data.error,
    promptSha256:createHash('sha256').update(JSON.stringify(body.input)).digest('hex'),
    outputContractSha256:createHash('sha256').update(JSON.stringify(body.text||null)).digest('hex'),
    batchItems,maxOutputTokens:body.max_output_tokens,durationMs:Date.now()-start,usage:data.usage,
    visibleOutputChars:text.length,rawText:text,rawResult:raw,parseError:!raw});
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation,normalizeStage4JsonForRegression}=await import('../lib/parsing/secondaryValidator.js');
const usage=[],started=Date.now();
let items,error,metadata;
try{
  items=await performSecondaryValidation(structuredClone(source.items),source.venue,source.timestamp,{
    stage4ModelOverride:model,stage4BatchSize:15,stage4BatchConcurrency:2,lunaCalendarLiteralSourcePrompt:true,
    diagnosticContext:{fileId:'stage4-frozen-comparison',postId:source.postId||caseId,rowIndex:source.row||0,runId:'local-'+repeat},
    gptUsageHandler:record=>usage.push(record),
  });
  metadata=Object.fromEntries(Object.keys(items).filter(k=>k.startsWith('_')).map(k=>[k,items[k]]));
}catch(e){error=e.message;}
const result={caseId,arm,repeat:Number(repeat),model,effort,noLiveWrites:true,sourceSha256:createHash('sha256').update(JSON.stringify(source)).digest('hex'),inputCount:source.items.length,outputCount:items?.length||0,wallMs:Date.now()-started,items,metadata,usage,requests,error};
await fs.mkdir(process.env.AUDIT_OUTPUT,{recursive:true});
await fs.writeFile(path.join(process.env.AUDIT_OUTPUT,`${caseId}-${arm}-r${repeat}.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify({caseId,arm,repeat,inputs:result.inputCount,outputs:result.outputCount,wallMs:result.wallMs,calls:requests.length,error}));
