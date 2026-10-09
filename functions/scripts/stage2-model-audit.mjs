// No-write paired audit. Uses the compiled production classifier and router.
// OPENAI_API_KEY, AUDIT_INPUT, AUDIT_OUTPUT and optional AUDIT_ENVIRONMENT_FILE.
// Candidate effort goes through ParsingConfig; transport only records diagnostics.
import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const local = new AsyncLocalStorage();
if (!process.env.OPENAI_API_KEY || !process.env.AUDIT_INPUT || !process.env.AUDIT_OUTPUT) throw new Error('Require key and audit paths');
if (process.env.AUDIT_ENVIRONMENT_FILE) {
  const readback=JSON.parse(await fs.readFile(process.env.AUDIT_ENVIRONMENT_FILE,'utf8'));
  for (const [k,v] of Object.entries(readback.serviceConfig.environmentVariables)) if (/^(STAGE|ENABLE_STAGE2|LUNA_)/.test(k)) process.env[k]=String(v);
}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (url,options={})=>{
  const requestUrl=typeof url==='string'?url:url?.url||String(url);
  if (!requestUrl.startsWith('https://api.openai.com/v1/')) throw new Error('Audit only permits OpenAI requests: '+new URL(requestUrl).origin);
  const context=local.getStore();
  let body;try{body=JSON.parse(options.body);}catch(e){console.error('Audit transport body type',typeof options.body);throw e;}
  const headers=new Headers(options.headers);headers.delete('content-length');
  const start=Date.now();
  let response;try{response=await nativeFetch(url,{...options,headers,body:JSON.stringify(body)});}catch(e){console.error('Audit transport failure',e.message,e.cause?.message);throw e;}
  const data=await response.clone().json();
  const input=body.input?.[0]?.content||[];
  context?.requests.push({model:body.model,effort:body.reasoning?.effort||'model_default',maxOutputTokens:body.max_output_tokens,imageCount:input.filter(x=>x.type==='input_image').length,promptSha256:createHash('sha256').update(input.filter(x=>x.type==='input_text').map(x=>x.text).join('')).digest('hex'),durationMs:Date.now()-start,httpStatus:response.status,status:data.status,incompleteDetails:data.incomplete_details,usage:data.usage,error:data.error,outputText:(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')});
  return response;
};
// Compiled production modules are CommonJS; register the matching SDK runtime.
createRequire(import.meta.url)('openai/shims/web');
const {classifyContent}=await import('../lib/parsing/contentClassifier.js');
const {resolveStage2ScoreRouting}=await import('../lib/parsing/stage2Routing.js');
const input=JSON.parse(await fs.readFile(process.env.AUDIT_INPUT,'utf8'));
const output=path.resolve(process.env.AUDIT_OUTPUT);await fs.mkdir(output,{recursive:true});
const availableArms=[{id:'mini-current',model:'gpt-5-mini'},{id:'luna-none',model:'gpt-6-luna',effort:'none'},{id:'luna-high',model:'gpt-6-luna',effort:'high'},{id:'luna-negative-review',model:'gpt-6-luna',effort:'none',negativeRecheck:true}];
const selectedArms=process.env.AUDIT_ARMS?.split(',')||['mini-current','luna-none','luna-high'];
if(selectedArms.some(id=>!availableArms.some(a=>a.id===id)))throw new Error('Unknown audit arm');
const arms=availableArms.filter(a=>selectedArms.includes(a.id));
const tasks=input.flatMap((source,index)=>arms.map((arm,j)=>({source,arm:arms[(j+index)%arms.length]})));
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<tasks.length){const {source,arm}=tasks[cursor++];const target=path.join(output,source.caseId+'-'+arm.id+'.json');try{await fs.access(target);continue;}catch{}
 const context={arm,requests:[]};await local.run(context,async()=>{const started=Date.now(),usage=[];try{
   const images=await Promise.all(source.imageFiles.map(async p=>'data:image/jpeg;base64,'+(await fs.readFile(p)).toString('base64')));
   const classification=await classifyContent(source.caption,images,source.venue,{utcStartDate:source.utcStartDate},{stage2ModelOverride:arm.model,stage2ReasoningEffort:arm.effort,stage2LunaNegativeRecheck:arm.negativeRecheck,gptUsageHandler:u=>usage.push(u)});
   const routing=resolveStage2ScoreRouting(source.caption,classification,source.validation);
   const record={caseId:source.caseId,row:source.row,postId:source.postId,source:source.source,arm:arm.id,model:arm.model,imageCount:images.length,classification,routing,resolvedContentType:routing.shouldUseRoutedContentType?routing.routedContentType:classification.contentType,passesConfidenceGate:classification.confidence>=0.6,fallback:/\| GPT error:/.test(classification.classificationReason),usage,requests:context.requests,elapsedMs:Date.now()-started};
   if(context.requests.length===0)throw new Error('Transport capture missing');
   await fs.writeFile(target,JSON.stringify(record,null,2));
   console.log(JSON.stringify({caseId:source.caseId,arm:arm.id,route:record.resolvedContentType,confidence:classification.confidence,elapsedMs:record.elapsedMs,requests:context.requests.length}));
 }catch(e){await fs.writeFile(target,JSON.stringify({caseId:source.caseId,arm:arm.id,error:e.message,requests:context.requests},null,2));console.error(source.caseId,arm.id,e.message);}});
}}));
