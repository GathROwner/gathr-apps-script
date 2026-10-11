import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='artifacts/luna-stage4-cache-layout-oct11';
const audit='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const quantile=(xs,p)=>{const s=xs.slice().sort((a,b)=>a-b);return s[Math.max(0,Math.ceil(s.length*p)-1)]||0;};
function stats(calls){
  const sum=f=>calls.reduce((s,c)=>s+(f(c)||0),0);
  const input=sum(c=>c.input),cached=sum(c=>c.cached),output=sum(c=>c.output),reasoning=sum(c=>c.reasoning);
  const inputUSD=((input-cached)*.05+cached*.005)/1e6,outputUSD=output*.4/1e6;
  return {calls:calls.length,input,cached,output,reasoning,nonReasoningOutput:output-reasoning,
    cacheWriteKnownCalls:calls.filter(c=>c.write!==undefined).length,cacheWriteUnknownCalls:calls.filter(c=>c.write===undefined).length,
    cacheWrites:sum(c=>c.write),inputUSD,outputUSD,totalUSD:inputUSD+outputUSD,
    ms:sum(c=>c.ms),medianMs:quantile(calls.map(c=>c.ms),.5),p95Ms:quantile(calls.map(c=>c.ms),.95),maxMs:quantile(calls.map(c=>c.ms),1),
    badCalls:calls.filter(c=>c.bad).map(c=>({row:c.row,responseId:c.id,reason:c.bad}))};
}
const logs=read(audit+'/logs.json');
const diagnostic=logs.filter(l=>l.jsonPayload?.message==='Stage 4 Responses diagnostics').map(l=>l.jsonPayload.context);
assert.equal(diagnostic.length,56);assert.equal(new Set(diagnostic.map(c=>c.responseId)).size,56);
const production=stats(diagnostic.map(c=>({input:c.inputTokens,cached:c.cachedInputTokens,output:c.outputTokens,reasoning:c.reasoningTokens,
  write:c.cacheWriteTokens,ms:c.durationMs,row:c.rowIndex,id:c.responseId,bad:c.responseStatus!=='completed'?c.responseStatus:undefined})));
assert.equal(production.input,151211);assert.equal(production.output,78610);assert.equal(production.cached,0);
const ledger=read(audit+'/ledger.json');
for(const [key,metric] of [['calls','calls'],['inputTokens','input'],['outputTokens','output'],['cachedInputTokens','cached'],['cacheWriteTokens','cacheWrites']]){
  assert.equal(ledger.reduce((s,l)=>s+(l.usage?.byStage?.stage4?.[key]||0),0),production[metric]);
}
const result={production,productionOutputCostFraction:production.outputUSD/production.totalUSD,
  theoreticalAllInput90PercentDiscountTotalSaving:production.inputUSD*.9/production.totalUSD,runs:[]};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const prose=new Set(['description','extractionReason','reason','validationReason']);
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('-api'))){
  const dir=root+'/'+name;if(!fs.existsSync(dir+'/summary.json'))continue;
  const summary=read(dir+'/summary.json');assert(summary.complete);
  const cohort=read(dir+'/cohort.json');
  const records=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length,cohort.length*2);
  assert.equal(records.reduce((s,r)=>s+r.requests.length,0),summary.totalCalls);
  const arms={};
  for(const arm of ['baseline','candidate']){
    const rs=records.filter(r=>r.arm===arm);assert.equal(rs.length,cohort.length);
    const calls=rs.flatMap(r=>r.requests.map(c=>({input:c.usage?.input_tokens,cached:c.usage?.input_tokens_details?.cached_tokens,
      write:c.usage?.input_tokens_details?.cache_write_tokens,output:c.usage?.output_tokens,reasoning:c.usage?.output_tokens_details?.reasoning_tokens,
      ms:c.ms,row:r.row,id:c.responseId,bad:c.httpStatus!==200?'http_'+c.httpStatus:c.status!=='completed'?c.status:c.parseError?'parse_error':
        c.rawDecisions?.length!==c.inputItems.length?'count_mismatch':undefined})));
    arms[arm]={...stats(calls),kept:rs.reduce((s,r)=>s+(r.output?.length||0),0),errors:rs.filter(r=>r.error),
      guards:rs.filter(r=>r.metadata?._validationFallbackReason).map(r=>({row:r.row,reason:r.metadata._validationFallbackReason})),
      prefixes:[...new Set(rs.flatMap(r=>r.requests.map(c=>c.prefix)))]};
  }
  const differences=[];
  for(const source of cohort){
    const b=records.find(r=>r.row===source.row&&r.arm==='baseline'),c=records.find(r=>r.row===source.row&&r.arm==='candidate');
    const key=i=>i._pipelineIndex??JSON.stringify([i.name,i.date,i.startTime]);
    const bm=new Map((b.output||[]).map(i=>[key(i),i])),cm=new Map((c.output||[]).map(i=>[key(i),i]));
    const missingInCandidate=[...bm.keys()].filter(k=>!cm.has(k)),extraInCandidate=[...cm.keys()].filter(k=>!bm.has(k));
    const fieldChanges=[];
    for(const [k,bi] of bm){const ci=cm.get(k);if(!ci)continue;
      const changes=[...new Set([...Object.keys(bi),...Object.keys(ci)])].filter(f=>!equal(bi[f],ci[f]));
      if(changes.length)fieldChanges.push({index:k,name:bi.name,fields:changes,protectedFields:changes.filter(f=>!prose.has(f)),
        baseline:Object.fromEntries(changes.map(f=>[f,bi[f]])),candidate:Object.fromEntries(changes.map(f=>[f,ci[f]]))});
    }
    const duplicateIndices=[b,c].flatMap(r=>{const ids=(r.output||[]).map(key);return new Set(ids).size!==ids.length?[r.arm]:[];});
    if(missingInCandidate.length||extraInCandidate.length||fieldChanges.length||duplicateIndices.length)differences.push({row:source.row,postId:source.postId,venue:source.venue,
      inputCount:source.items.length,baselineCount:b.output?.length,candidateCount:c.output?.length,missingInCandidate,extraInCandidate,fieldChanges,duplicateIndices});
  }
  result.runs.push({name,summary,arms,totalSaving:1-arms.candidate.totalUSD/arms.baseline.totalUSD,
    inputSaving:1-arms.candidate.inputUSD/arms.baseline.inputUSD,timeSaving:1-arms.candidate.ms/arms.baseline.ms,differences,
    protectedDifferences:differences.filter(d=>d.missingInCandidate.length||d.extraInCandidate.length||d.duplicateIndices.length||d.fieldChanges.some(c=>c.protectedFields.length))});
}
fs.writeFileSync(root+'/report.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,runs:result.runs.map(({differences,protectedDifferences,...r})=>({...r,differences:differences.length,protectedDifferences}))},null,2));
