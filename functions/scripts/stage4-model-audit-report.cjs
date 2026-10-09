const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const dir=process.env.AUDIT_DIRECTORY;if(!dir)throw Error('Set AUDIT_DIRECTORY');
const cases=JSON.parse(fs.readFileSync(dir+'/cohort.json'));
// Adjudications correct labels without changing the hashed, frozen API cohort.
const adjudications=fs.existsSync(dir+'/adjudications.json')?JSON.parse(fs.readFileSync(dir+'/adjudications.json')):[];
const runs=fs.readdirSync(dir+'/results').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(dir+'/results/'+f)));
const arms=['nano-low','luna-none','luna-low','luna-medium'];
const norm=s=>String(s??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clock=s=>{s=String(s||'').trim();if(!s||s.toLowerCase()==='unknown')return '';const m=s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?(?:\s+[A-Z]{2,4})?$/i);if(!m)return s;let h=+m[1];if(m[3])h=h%12+(/pm/i.test(m[3])?12:0);return String(h).padStart(2,'0')+':'+m[2];};
const price=i=>i?.price??i?.pricing?.price;
const identity=i=>[norm(i.name),i.date||'',clock(i.startTime)].join('|');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fieldChanges(input,output){
  const changes=[];
  for(const [key,a,b]of [
    ['name',norm(input.name),norm(output.name)],['date',input.date,output.date],
    ['startTime',clock(input.startTime),clock(output.startTime)],['endTime',clock(input.endTime),clock(output.endTime)],
    ['venue',input.venue,output.venue],['price',norm(price(input)),norm(price(output))],
    ['ticketLink',input.ticketLink,output.ticketLink],['imageIndex',input.relevantImageIndex,output.relevantImageIndex],
    ['sourceType',input._sourceType,output._sourceType],
  ]){if(a===undefined||(['venue','price','ticketLink'].includes(key)&&a===''))continue;if(a!==b)changes.push({field:key,source:a,output:b});}
  return changes;
}
function review(r){
  const c=cases.find(c=>c.caseId===r.caseId);assert.equal(hash(c),r.sourceSha256);
  assert.equal(r.noLiveWrites,true);assert.equal(r.error,undefined);
  const remaining=[...(r.items||[])],decisions=[],changes=[];
  c.items.forEach((input,index)=>{
    let at=remaining.findIndex(o=>o._pipelineIndex===input._pipelineIndex);
    if(at<0)at=remaining.findIndex(o=>identity(o)===identity(input));
    const out=at<0?undefined:remaining.splice(at,1)[0],actual=out?'KEPT':'REJECTED';
    const adjudication=adjudications.find(a=>a.caseId===c.caseId&&a.index===index);
    const expected=adjudication?.decision||c.expected[index].decision;
    decisions.push({index,name:input.name,date:input.date,startTime:input.startTime,expected,originalExpected:c.expected[index].decision,adjudication:adjudication?.basis,actual,discrepancy:expected!=='REVIEW'&&expected!==actual});
    if(out){for(const change of fieldChanges(input,out))changes.push({index,name:input.name,...change});
      const expectedPattern=c.expected[index].recurringPattern;
      if(expectedPattern!==undefined&&out.recurringPattern!==expectedPattern)changes.push({index,name:input.name,field:'expectedRecurringPattern',source:expectedPattern,output:out.recurringPattern});
      for(const field of ['description','timeFlags','spatial'])if(input[field]&&!out[field])changes.push({index,name:input.name,field,source:'present',output:'missing'});
    }
  });
  const rawChecks=r.requests.map((q,call)=>{
    const entries=q.rawResult?.validatedItems||[],changes=[],decisions=[];
    q.batchItems.forEach((input,n)=>{
      const entry=entries[n],index=c.items.findIndex(i=>hash(i)===hash(input));assert.ok(index>=0);
      // Positional attribution is unreliable after an omitted/extra entry.
      if(entries.length===q.batchItems.length&&entry?.item)for(const change of fieldChanges(input,entry.item))changes.push({index,name:input.name,...change});
      decisions.push({index,name:input.name,decision:entry?.decision,reason:entry?.reason,corrections:entry?.corrections});
    });
    return {call,expectedCount:q.batchItems.length,rawCount:entries.length,countMismatch:entries.length!==q.batchItems.length,positionalAttributionReliable:entries.length===q.batchItems.length,changes,decisions};
  });
  return {caseId:r.caseId,arm:r.arm,repeat:r.repeat,sourceKind:c.sourceKind,wallMs:r.wallMs,inputCount:r.inputCount,outputCount:r.outputCount,
    metadata:r.metadata,error:r.error,decisions,decisionDiscrepancies:decisions.filter(d=>d.discrepancy),changedSourceFields:changes,extraItems:remaining,rawChecks,
    signature:r.requests.map(q=>q.promptSha256+':'+q.outputContractSha256).sort()};
}
const reviewed=runs.map(review);
const cost=(q,cold=false)=>{const u=q.usage||{},l=q.model==='gpt-6-luna',cached=cold?0:u.input_tokens_details?.cached_tokens||0,write=cold?0:u.input_tokens_details?.cache_write_tokens||u.input_tokens_details?.cache_creation_tokens||0;return(((u.input_tokens||0)-cached-write)*(l?.1:.05)+cached*(l?.01:.005)+write*(l?.125:.05)+(u.output_tokens||0)*(l?.5:.4))/1e6;};
const stats={};
for(const arm of arms){
  const rr=runs.filter(r=>r.arm===arm),rv=reviewed.filter(r=>r.arm===arm),qq=rr.flatMap(r=>r.requests),times=rr.map(r=>r.wallMs).sort((a,b)=>a-b);
  const median=times.length%2?times[(times.length-1)/2]:(times[times.length/2-1]+times[times.length/2])/2;
  stats[arm]={runs:rr.length,calls:qq.length,inputItems:rr.reduce((s,r)=>s+r.inputCount,0),keptItems:rr.reduce((s,r)=>s+r.outputCount,0),
    summedWallMs:times.reduce((s,n)=>s+n,0),medianWallMs:median,maxWallMs:times.at(-1),observedUsd:qq.reduce((s,q)=>s+cost(q),0),uncachedUsd:qq.reduce((s,q)=>s+cost(q,true),0),
    inputTokens:qq.reduce((s,q)=>s+(q.usage?.input_tokens||0),0),outputTokens:qq.reduce((s,q)=>s+(q.usage?.output_tokens||0),0),reasoningTokens:qq.reduce((s,q)=>s+(q.usage?.output_tokens_details?.reasoning_tokens||0),0),
    incompleteCalls:qq.filter(q=>q.status!=='completed').length,httpErrors:qq.filter(q=>q.httpStatus!==200).length,jsonErrors:qq.filter(q=>q.parseError).length,
    fallbackRuns:rr.filter(r=>r.metadata?._validationFallbackReason).length,decisionDiscrepancies:rv.reduce((s,r)=>s+r.decisionDiscrepancies.length,0),changedSourceFields:rv.reduce((s,r)=>s+r.changedSourceFields.length,0),
    gradedItems:rv.reduce((s,r)=>s+r.decisions.filter(d=>d.expected!=='REVIEW').length,0),reviewOnlyItems:rv.reduce((s,r)=>s+r.decisions.filter(d=>d.expected==='REVIEW').length,0)};
}
const comparisons=[];
for(const r of reviewed.filter(r=>r.arm!=='nano-low')){
  const base=reviewed.find(b=>b.caseId===r.caseId&&b.repeat===r.repeat&&b.arm==='nano-low');if(!base)continue;
  const identicalPrompts=JSON.stringify(base.signature)===JSON.stringify(r.signature);assert.ok(identicalPrompts,'Compared prompts must match');
  comparisons.push({caseId:r.caseId,arm:r.arm,repeat:r.repeat,identicalPrompts,nanoKept:base.outputCount,lunaKept:r.outputCount,nanoMs:base.wallMs,lunaMs:r.wallMs});
}
const summary={checkedAt:new Date().toISOString(),baseCommit:'cd6aa93',productionChanges:false,tests:26,
  sourceCases:cases.length,realSourceCases:cases.filter(c=>c.sourceKind==='saved Stage 3 replay input').length,runs:runs.length,
  stats,adjudications,comparisons,reviewed,limits:['Frozen actual Stage 3 replay inputs plus separately labeled synthetic fixtures; no upstream model calls or live writer',
    'Current Stage 4 prompt, free-form JSON output, 32k cap, 15-item batching, two concurrent batches, normalizers and deterministic guards retained',
    'Marathon without clock times and online giveaway are review observations, not counted as model comparison errors',
    'Per-token rates are from official October 9 model pages; costs are usage estimates, not invoices',
    'Some historical inputs lack original timestamp metadata; the frozen fallback timestamp is visible in the cohort',
    'Source field changes are audit candidates; legitimate normalization and source-supported corrections need manual interpretation']};
fs.writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({runs:runs.length,stats,decisionIssues:reviewed.filter(r=>r.decisionDiscrepancies.length).map(r=>({case:r.caseId,arm:r.arm,repeat:r.repeat,issues:r.decisionDiscrepancies})),fieldIssues:reviewed.filter(r=>r.changedSourceFields.length).map(r=>({case:r.caseId,arm:r.arm,repeat:r.repeat,issues:r.changedSourceFields})),fallbacks:reviewed.filter(r=>r.metadata?._validationFallbackReason).map(r=>({case:r.caseId,arm:r.arm,repeat:r.repeat,reason:r.metadata._validationFallbackReason}))},null,2));
