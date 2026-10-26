// Explicit paid, bounded, original-source evaluation. Never a row replay or writer.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createStage1EvaluationPrompt,createValidationSchema} from '../lib/parsing/contentValidator.js';
import {createFormattingPrompt,createBoundFormattingSchema,parseStrictFormattingEnvelope} from '../lib/parsing/finalFormatter.js';
import {IMAGE_PRICE_REVIEW_INSTRUCTIONS,validateReviewedImagePrice} from './reviewed-image-price.mjs';
const args=process.argv.slice(2),arg=k=>args.find(x=>x.startsWith(k+'='))?.slice(k.length+1);
if(!args.includes('--paid')||arg('--max-calls')!=='8'||!arg('--evidence'))throw Error('Requires explicit --paid --max-calls=8 --evidence=private-source-directory');
const evidence=path.resolve(arg('--evidence')),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts/oct16-eight-group/paid-evaluation');
if(fs.existsSync(out))throw Error('Prior paid evidence exists; do not retry or recharge it');fs.mkdirSync(out,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(path.join(evidence,f),'utf8'));
const snapshots=read('snapshots.json').map(x=>x.data),gallery=read('gallery-manifest.json');
const row=n=>snapshots.find(x=>x.rowIndex===n),art=n=>row(n).stages[0].output.stageArtifacts;
const originalImage=(r,index=0)=>{
 const saved=gallery.find(x=>x.row===r&&x.index===index&&x.status==='available');if(!saved)throw Error('Original image unavailable');
 const bytes=fs.readFileSync(saved.path),mime=bytes[0]===0x89?'image/png':'image/jpeg';
 return {url:'data:'+mime+';base64,'+bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),path:saved.path};
};
let key=execFileSync('powershell.exe',['-NoProfile','-Command','& gcloud secrets versions access 1 --secret=GATHR_OPENAI_API_KEY --project=gathr-migrated'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(!key)throw Error('Existing bound secret unavailable');
const ledger=[],results=[];let count=0;
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({requests:ledger,results,requestCount:count,liveWrites:0,paid:true},null,2));
const call=async(label,payload)=>{
 if(count>=8)throw Error('Bounded generation budget exhausted');const n=++count,started=Date.now();
 ledger.push({request:n,label,model:payload.model,effort:payload.reasoning?.effort,status:'started'});save();
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({...payload,store:false}),signal:AbortSignal.timeout(150000)});
 const raw=await response.json();fs.writeFileSync(path.join(out,`${n}-${label}-raw.json`),JSON.stringify(raw,null,2));
 const u=raw.usage||{},details=u.input_tokens_details||{},input=Number(u.input_tokens||0),output=Number(u.output_tokens||0),cached=Number(details.cached_tokens||0),write=Number(details.cache_write_tokens||0);
 Object.assign(ledger[n-1],{httpStatus:response.status,responseId:raw.id,status:raw.status,latencyMs:Date.now()-started,inputTokens:input,outputTokens:output,cachedInputTokens:cached,cacheWriteTokens:write,
  estimatedUsd:((input-cached-write)*.10+cached*.01+write*.125+output*.50)/1e6});save();
 if(!response.ok||raw.status!=='completed')throw Error(`Controlled request failed (${response.status}, ${raw.status})`);
 return raw.output_text||(raw.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
};
try{
 for(const [label,text,posted] of [['altuck',row(220).inputText,row(220).rowMeta.timestamp],['harvest-control',row(56).inputText,row(56).rowMeta.timestamp]]){
  const prompt=createStage1EvaluationPrompt(text,0,'Fixture Publisher',posted,'compact-v10');
  const result=JSON.parse(await call(label,{model:'gpt-6-luna',reasoning:{effort:'high'},max_output_tokens:12000,
   text:{format:{type:'json_schema',name:'validateContent',strict:true,schema:createValidationSchema()[0].parameters}},input:[{role:'user',content:[{type:'input_text',text:prompt}]}]}));
  results.push({label,result});save();
 }
 for(const n of [56,172]){
  const s=row(n),items=art(n).stage4Items,schema=createBoundFormattingSchema(items.length);
  const prompt=`BATCH COUNT ENFORCEMENT: You are formatting exactly ${items.length} validated items.\nReturn exactly ${items.length} objects in formattedEvents (one-to-one with the input order).\nCopy each input sourceItemIndex to the matching formatted event. Do not drop, merge, or reorder items.\nNever return arrays of values for an item; each must be a JSON object.\n\n`+createFormattingPrompt(items,s.establishment,'',s.rowMeta.timestamp);
  const text=await call('stage5-'+n,{model:'gpt-6-luna',reasoning:{effort:'none'},max_output_tokens:32000,text:{format:{type:'json_schema',name:'stage5_single_envelope_v2',strict:true,schema:schema[0].parameters}},input:[{role:'user',content:[{type:'input_text',text:prompt}]}]});
  const parsed=parseStrictFormattingEnvelope(text,schema);results.push({label:'stage5-'+n,count:parsed.formattedEvents.length,expected:items.length,parsed});save();
 }
 for(const [n,itemName] of [[295,'Meatloaf Sandwich'],[297,'2 Chicken Burgers']]){
  const image=originalImage(n);const text=await call('price-'+n,{model:'gpt-6-luna',reasoning:{effort:'high'},max_output_tokens:4000,
   text:{format:{type:'json_schema',name:'source_price_region',strict:true,schema:{type:'object',additionalProperties:false,required:['readable','itemText','priceText','regionText'],properties:{readable:{type:'boolean'},itemText:{type:'string'},priceText:{type:'string'},regionText:{type:'string'}}}}},
   input:[{role:'user',content:[{type:'input_text',text:IMAGE_PRICE_REVIEW_INSTRUCTIONS+'\nRequested item: '+itemName},{type:'input_image',image_url:image.url,detail:'high'}]}]});
  const value=JSON.parse(text);let verified;try{verified=validateReviewedImagePrice(value,{itemName,imageSha256:image.sha256});}catch{verified={hold:true};}
  results.push({label:'price-'+n,sourceImageSha256:image.sha256,verified,value});save();
 }
 const worker=await import(pathToFileURL(path.join(root,'artifacts/oct16-eight-group/worker-assembly/scripts/festival-evidence-extractor.mjs')).href);
 const s=row(57),image=originalImage(57);let leg=0;
 const capture=await worker.extractFestivalEvidence({caption:s.inputText,imageUrls:s.rowMeta.mediaUrls,
  edition:{id:'fixture-anchor',name:'ANCHOR Fest',year:2026,startDate:'2026-10-14',endDate:'2026-10-18'},apiKey:key,
  fetchImpl:async(url,options)=>{const payload=JSON.parse(options.body);for(const message of payload.input)for(const block of message.content||[])if(block.type==='input_image')block.image_url=image.url;
   const text=await call('anchor-'+(++leg),payload);return new Response(JSON.stringify({status:'completed',output_text:text}),{status:200});}});
 delete capture.rawResponses;results.push({label:'anchor',captionPreserved:capture.documents[0].text===s.inputText,sourceImageSha256:image.sha256,capture});save();
}catch(error){results.push({failure:String(error.message).replaceAll(key,'[redacted]')});save();process.exitCode=1;}finally{key='';save();}
console.log(JSON.stringify({output:out,requests:count,liveWrites:0}));
