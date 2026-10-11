// Offline comparison: differences are review targets, not automatic judgments of truth.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.argv[2];assert(dir);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const results=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
const cohort=read(dir+'/cohort.json');
const norm=v=>typeof v==='string'?v.trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' '):v;
const name=v=>norm(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]/g,'');
const project=(item,source)=>({name:item.name||'',date:item.date||'',startTime:item.startTime||'',endTime:item.endTime||'',
  venue:item.venue||'',effectiveVenue:item.venue||source.venue,price:item.price||'',pricing:item.pricing||'',ticketLink:item.ticketLink||'',
  recurringPattern:item.recurringPattern||'none',relevantImageIndex:item.relevantImageIndex,spatial:item.spatial||null});
function pairItems(b,c,source){
  const left=b.map(x=>project(x,source)),right=c.map(x=>project(x,source)),remaining=[...right],changes=[];
  for(const item of left){
    let ix=remaining.findIndex(x=>x.date===item.date&&x.startTime===item.startTime&&name(x.name)===name(item.name));
    if(ix<0)ix=remaining.findIndex(x=>x.date===item.date&&name(x.name)===name(item.name));
    if(ix<0)ix=remaining.findIndex(x=>x.date===item.date&&x.startTime===item.startTime&&x.effectiveVenue===item.effectiveVenue);
    if(ix<0){changes.push({kind:'unmatched-baseline',baseline:item});continue;}
    const other=remaining.splice(ix,1)[0];
    const fields=Object.keys(item).filter(k=>JSON.stringify(norm(item[k]))!==JSON.stringify(norm(other[k])));
    if(fields.length)changes.push({kind:'changed',fields,baseline:item,candidate:other});
  }
  changes.push(...remaining.map(x=>({kind:'unmatched-candidate',candidate:x})));
  return changes;
}
function summarize(arm,mainOnly=false,excludeRows=[]){
  const rows=results.filter(r=>r.arm===arm&&!excludeRows.includes(r.row)),calls=[];
  for(const r of rows){
    assert.equal(r.calls.length,r.usage.length,'Every actual model response must have usage');
    r.calls.forEach((c,i)=>{if(!mainOnly||r.usage[i].stage==='stage3')calls.push({...c,stage:r.usage[i].stage,component:r.usage[i].component});});
  }
  const sum=fn=>calls.reduce((n,c)=>n+(fn(c)||0),0);
  const inputUSD=sum(c=>{const u=c.usage,d=u?.input_tokens_details;return u?((u.input_tokens-(d.cached_tokens||0)-d.cache_write_tokens)*.1+(d.cached_tokens||0)*.01+d.cache_write_tokens*.125)/1e6:0;});
  return {posts:rows.length,calls:calls.length,errors:rows.filter(r=>r.error).map(r=>({row:r.row,error:r.error})),
    badResponses:calls.filter(c=>c.httpStatus!==200||c.status!=='completed'||c.incomplete),
    inputTokens:sum(c=>c.usage?.input_tokens),outputTokens:sum(c=>c.usage?.output_tokens),reasoningTokens:sum(c=>c.usage?.output_tokens_details?.reasoning_tokens),
    cachedReadTokens:sum(c=>c.usage?.input_tokens_details?.cached_tokens),cacheWriteTokens:sum(c=>c.usage?.input_tokens_details?.cache_write_tokens),
    inputUSD,outputUSD:sum(c=>c.usage?.output_tokens*.5/1e6),usd:sum(c=>c.usd),summedSeconds:sum(c=>c.ms)/1000,
    outputItems:rows.reduce((n,r)=>n+(r.output?.length||0),0),noApiRows:rows.filter(r=>!r.calls.length).map(r=>r.row),
    prefixStats:[...new Set(calls.filter(c=>c.applied).map(c=>c.prefix))].map(prefix=>{
      const xs=calls.filter(c=>c.applied&&c.prefix===prefix);return {prefix,chars:xs[0].prefixChars,calls:xs.length,hits:xs.filter(c=>c.usage?.input_tokens_details?.cached_tokens>0).length,writes:sumCall(xs,c=>c.usage?.input_tokens_details?.cache_write_tokens)};
    })};
}
const sumCall=(xs,fn)=>xs.reduce((n,c)=>n+(fn(c)||0),0);
const pairs=cohort.map(source=>{
  const b=results.find(r=>r.row===source.row&&r.arm==='baseline'),c=results.find(r=>r.row===source.row&&r.arm==='candidate');assert(b&&c);
  return {row:source.row,venue:source.venue,route:source.type,baselineCount:b.output?.length,candidateCount:c.output?.length,
    baselineCalls:b.calls.length,candidateCalls:c.calls.length,changes:pairItems(b.output||[],c.output||[],source)};
});
const baseline=summarize('baseline'),candidate=summarize('candidate');
const report={complete:fs.existsSync(dir+'/summary.json'),sourceCases:cohort.length,excluded:read(dir+'/excluded.json'),baseline,candidate,
  totalSavingPercent:100*(1-candidate.usd/baseline.usd),inputSavingPercent:100*(1-candidate.inputUSD/baseline.inputUSD),
  mainStage3:{baseline:summarize('baseline',true),candidate:summarize('candidate',true)},
  freshSources:{excludedPreviouslyTestedRows:[37,234,292],baseline:summarize('baseline',false,[37,234,292]),candidate:summarize('candidate',false,[37,234,292])},pairs};
fs.writeFileSync(dir+'/analysis.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,pairs:pairs.map(p=>({...p,changes:p.changes.length}))},null,2));
