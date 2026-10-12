import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const dir=process.argv[2];assert(dir);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rows=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
if(process.argv[3])rows.push(...fs.readFileSync(process.argv[3]+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.arm==='baseline'));
const runtime=process.argv.find(x=>x.startsWith('--runtime='))?.slice(10);
if(runtime){
 const saved=fs.readFileSync(runtime+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
 for(const r of rows.filter(r=>r.arm==='compact')){
  const current=saved.find(s=>s.caseId===r.caseId&&s.arm==='compact');assert(current);
  assert.deepEqual(current.requests.map(q=>JSON.stringify(q.sourceIndices)).sort(),r.requests.map(q=>JSON.stringify(q.sourceIndices)).sort(),'Playback call correspondence changed');
  r.output=current.output;r.metadata=current.metadata;
 }
}
const cohort=read(dir+'/cohort.json');
const stats={},differences=[];
const percentile=(a,p)=>a.sort((x,y)=>x-y)[Math.ceil(a.length*p)-1]||0;
for(const arm of ['baseline','compact']){
 const rs=rows.filter(r=>r.arm===arm),qs=rs.flatMap(r=>r.requests);
 const sum=fn=>qs.reduce((s,q)=>s+fn(q),0);
 stats[arm]={sources:rs.length,kept:rs.reduce((s,r)=>s+r.output.length,0),calls:qs.length,
  usd:sum(q=>q.usd||0),cacheNeutralUsd:sum(q=>((q.usage?.input_tokens||0)*.05+(q.usage?.output_tokens||0)*.4)/1e6),
  apiMs:sum(q=>q.ms||0),inputTokens:sum(q=>q.usage?.input_tokens||0),
  cachedTokens:sum(q=>q.usage?.input_tokens_details?.cached_tokens||0),outputTokens:sum(q=>q.usage?.output_tokens||0),
  reasoningTokens:sum(q=>q.usage?.output_tokens_details?.reasoning_tokens||0),visibleChars:sum(q=>q.visibleChars||0),
  medianCallMs:percentile(qs.map(q=>q.ms),.5),p95CallMs:percentile(qs.map(q=>q.ms),.95),
  holds:rs.filter(r=>r.metadata._compactValidationHold).map(r=>({caseId:r.caseId,...r.metadata._compactValidationHold})),
  fallbacks:rs.filter(r=>r.metadata._validationFallbackReason).map(r=>({caseId:r.caseId,reason:r.metadata._validationFallbackReason})),
  errors:rs.filter(r=>r.error).map(r=>({caseId:r.caseId,error:r.error}))};
}
const ignored=new Set(['_pipelineTotalStage3','_pipelineIndex']);
for(const source of cohort){
 const a=rows.find(r=>r.caseId===source.caseId&&r.arm==='baseline'),b=rows.find(r=>r.caseId===source.caseId&&r.arm==='compact');
 if(!a||!b)continue;
 const indices=r=>r.output.map(i=>i._pipelineIndex);
 const indexChanges={baselineOnly:indices(a).filter(i=>!indices(b).includes(i)),compactOnly:indices(b).filter(i=>!indices(a).includes(i))};
 const fields=[];
 for(const item of b.output){
  const before=a.output.find(i=>i._pipelineIndex===item._pipelineIndex);if(!before)continue;
  for(const key of new Set([...Object.keys(before),...Object.keys(item)])){
   if(ignored.has(key)||isDeepStrictEqual(before[key],item[key]))continue;
   if(key==='recurringPattern'&&[undefined,'none'].includes(before[key])&&[undefined,'none'].includes(item[key]))continue;
   fields.push({index:item._pipelineIndex,name:item.name,key,baseline:before[key],compact:item[key]});
  }
 }
 const raw=r=>r.requests.flatMap(q=>q.parsed?.decisions||q.parsed?.validatedItems?.map((e,i)=>({sourceItemIndex:e.item?._pipelineIndex??q.sourceIndices[i],...e,item:undefined}))||[]);
 if(indexChanges.baselineOnly.length||indexChanges.compactOnly.length||fields.length||b.metadata._compactValidationHold){
  differences.push({caseId:source.caseId,postId:source.postId,venue:source.venue,caption:source.caption,
   ...indexChanges,fields,hold:b.metadata._compactValidationHold,items:source.items,
   baselineOutput:a.output,compactOutput:b.output,baselineDecisions:raw(a),compactDecisions:raw(b),
   baselineFallback:a.metadata._validationFallbackReason});
 }
}
const sourceFieldChanges=[];
for(const r of rows.filter(r=>r.arm==='compact'))for(const item of r.output){
 const source=cohort.find(c=>c.caseId===r.caseId).items.find(i=>i._pipelineIndex===item._pipelineIndex);assert(source);
 for(const key of new Set([...Object.keys(source),...Object.keys(item)])){
  if(ignored.has(key)||isDeepStrictEqual(source[key],item[key]))continue;
  if(key==='recurringPattern'&&[undefined,'none'].includes(source[key])&&[undefined,'none'].includes(item[key]))continue;
  sourceFieldChanges.push({caseId:r.caseId,index:item._pipelineIndex,key,source:source[key],output:item[key]});
 }
}
const result={complete:fs.existsSync(dir+'/summary.json'),runtimePlayback:runtime,stats,differences,sourceFieldChanges};
fs.writeFileSync(dir+(runtime?'/final-comparison.json':'/comparison.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({complete:result.complete,stats,differences:differences.map(d=>({caseId:d.caseId,baselineOnly:d.baselineOnly,compactOnly:d.compactOnly,fields:d.fields.map(f=>({index:f.index,key:f.key,baseline:f.baseline,compact:f.compact})),hold:d.hold}))},null,2));
