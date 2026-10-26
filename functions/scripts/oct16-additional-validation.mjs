// Three further controlled calls maximum, after the preserved first evaluation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {validateReviewedImagePrice} from './reviewed-image-price.mjs';
const args=process.argv.slice(2),e=args.find(x=>x.startsWith('--evidence='))?.slice(11);
if(!args.includes('--paid')||!e)throw Error('Explicit --paid --evidence required');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'artifacts/oct16-eight-group'),out=path.join(base,'additional-validation');
if(fs.existsSync(out))throw Error('Preserve prior controlled evidence; no blanket retry');
const prior=JSON.parse(fs.readFileSync(path.join(base,'paid-evaluation/summary.json')));if(prior.requestCount!==7)throw Error('Unexpected generation ledger');
fs.mkdirSync(out,{recursive:true});
const rows=JSON.parse(fs.readFileSync(path.join(e,'snapshots.json'))).map(x=>x.data),row=n=>rows.find(x=>x.rowIndex===n);
const gallery=JSON.parse(fs.readFileSync(path.join(e,'gallery-manifest.json'))),image=gallery.find(x=>x.row===57&&x.index===0&&x.status==='available');
const imageUrl='data:image/jpeg;base64,'+fs.readFileSync(image.path).toString('base64');
let secret=execFileSync('powershell.exe',['-NoProfile','-Command','& gcloud secrets versions access 1 --secret=GATHR_OPENAI_API_KEY --project=gathr-migrated'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
process.env.OPENAI_API_KEY=secret;
const nativeFetch=globalThis.fetch,ledger=[],results=[];let phase='stage5-multi',calls=0;
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({priorRequests:7,requestCount:calls,totalRequests:7+calls,requests:ledger,results,liveWrites:0},null,2));
globalThis.fetch=async(url,options)=>{
 if(!String(url).startsWith('https://api.openai.com/v1/responses'))throw Error('Unexpected controlled endpoint');
 if(calls>=3)throw Error('Additional controlled budget exhausted');const n=++calls,started=Date.now(),payload=JSON.parse(options.body);
 for(const msg of payload.input||[])for(const block of msg.content||[])if(block.type==='input_image')block.image_url=imageUrl;
 payload.store=false;options={...options,body:JSON.stringify(payload)};
 ledger.push({request:n,phase,model:payload.model,effort:payload.reasoning?.effort,cacheOptions:payload.prompt_cache_options,
  textFormat:payload.text?.format?.name,inputTextBlocks:payload.input?.flatMap(m=>(m.content||[]).filter(b=>b.type==='input_text').map(b=>({chars:b.text.length,breakpoint:b.prompt_cache_breakpoint}))),status:'started'});save();
 const response=await nativeFetch(url,options),raw=await response.clone().json();fs.writeFileSync(path.join(out,`${n}-${phase}-raw.json`),JSON.stringify(raw,null,2));
 const u=raw.usage||{},d=u.input_tokens_details||{},input=u.input_tokens||0,output=u.output_tokens||0,read=d.cached_tokens||0,write=d.cache_write_tokens||0;
 Object.assign(ledger[n-1],{status:raw.status,httpStatus:response.status,responseId:raw.id,latencyMs:Date.now()-started,inputTokens:input,outputTokens:output,cachedInputTokens:read,cacheWriteTokens:write,estimatedUsd:((input-read-write)*.10+read*.01+write*.125+output*.50)/1e6});save();return response;
};
try{
 createRequire(import.meta.url)('openai/shims/web');
 const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
 const s=row(165),items=s.stages[0].output.stageArtifacts.stage4Items;
 const formatted=await performFinalFormatting(items,s.establishment,'',s.rowMeta.timestamp,{stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:1},s.inputText);
 results.push({phase,count:formatted.length,expected:items.length,events:formatted.map(x=>({name:x.name,date:x.startDate,startTime:x.startTime,venue:x.venue,category:x.category}))});save();
 phase='anchor-revised';
 const worker=await import(pathToFileURL(path.join(base,'worker-assembly/scripts/festival-evidence-extractor.mjs')).href),r=row(57);
 const capture=await worker.extractFestivalEvidence({caption:r.inputText,imageUrls:r.rowMeta.mediaUrls,edition:{id:'fixture-anchor',name:'ANCHOR Fest',year:2026,startDate:'2026-10-14',endDate:'2026-10-18'},apiKey:secret});
 delete capture.rawResponses;results.push({phase,captionPreserved:capture.documents[0].text===r.inputText,capture});save();
}catch(error){results.push({phase,failure:String(error.message).replaceAll(secret,'[redacted]')});save();process.exitCode=1;}
finally{globalThis.fetch=nativeFetch;delete process.env.OPENAI_API_KEY;secret='';
 const previous=prior.results.find(x=>x.label==='price-295');
 try{results.push({phase:'price-295-revalidation',verified:validateReviewedImagePrice(previous.value,{itemName:'Meatloaf Sandwich',imageSha256:previous.sourceImageSha256}),newPaidCalls:0});}catch{results.push({phase:'price-295-revalidation',hold:true,newPaidCalls:0});}save();}
console.log(JSON.stringify({out,requests:calls,totalRequests:7+calls,liveWrites:0}));
