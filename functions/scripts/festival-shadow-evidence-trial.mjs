// Explicit paid extraction only; output is local evidence, never a publication.
import fs from 'node:fs/promises';import path from 'node:path';
import {extractFestivalEvidence} from './festival-evidence-extractor.mjs';
const args=process.argv.slice(2),option=name=>args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const snapshots=JSON.parse(await fs.readFile(option('snapshots'),'utf8'));
const ids=(option('source-ids')||'').split(',').filter(Boolean);if(!ids.length||ids.length>3)throw Error('Select one to three explicit source IDs');
const out=path.resolve(option('out'));await fs.mkdir(out,{recursive:true});
const edition=JSON.parse(await fs.readFile(option('edition'),'utf8'));
const reports=[];
for(const id of ids){
 const snapshot=snapshots.filter(s=>String(s.uniqueId)===id).sort((a,b)=>String(b.updateTime).localeCompare(String(a.updateTime)))[0];if(!snapshot)throw Error('Missing captured source '+id);
 if(snapshot.rowMeta?.dryRun||!Array.isArray(snapshot.rowMeta?.mediaUrls))throw Error('Not a complete production source capture');
 const file=path.join(out,`${id}.json`);
 try{await fs.access(file);throw Error('Output already exists; do not spend again without a new trial path');}catch(e){if(e.code!=='ENOENT')throw e;}
 const capture={id,sourceUrl:snapshot.facebookUrl,revision:snapshot.updateTime,caption:snapshot.inputText,imageUrls:snapshot.rowMeta.mediaUrls};
 try{
  let replay;
  if(option('replay-extraction')){const previous=JSON.parse(await fs.readFile(path.join(option('replay-extraction'),`${id}.json`),'utf8'));assertCapture(previous.capture,capture);replay=previous.diagnostics?.rawResponses?.[0]||previous.result?.rawResponses?.[0];if(!replay)throw Error('Captured extraction missing');}
  let calls=0;const fetchImpl=async(...request)=>{if(replay&&calls++===0)return new Response(JSON.stringify(replay),{status:200,headers:{'x-gathr-offline-replay':'1'}});return fetch(...request);};
  const result=await extractFestivalEvidence({...capture,edition,apiKey:process.env.OPENAI_API_KEY,verify:true,fetchImpl});
  await fs.writeFile(file,JSON.stringify({capture,result},null,2));reports.push({id,status:'captured',activities:result.activities.length,confirmed:result.activities.filter(x=>x.verification?.accepted).length,calls:result.requests.length,paidCalls:result.requests.filter(x=>!x.replayed).length,usage:result.requests.map(x=>x.usage),latencyMs:result.requests.map(x=>x.latencyMs)});
 }catch(error){await fs.writeFile(file,JSON.stringify({capture,error:String(error.message),diagnostics:error.evidenceDiagnostics??null},null,2));reports.push({id,status:'held',reason:error.message,calls:error.evidenceDiagnostics?.requests?.length??0,usage:error.evidenceDiagnostics?.requests?.map(x=>x.usage)});}
}
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({checkedAt:new Date().toISOString(),mode:'shadow',eventWrites:0,reports},null,2));console.log(JSON.stringify(reports));
function assertCapture(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Replayed source identity changed');}
