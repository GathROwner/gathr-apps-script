const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=process.env.AUDIT_DIRECTORY,input=process.env.AUDIT_INPUT;
if(!directory||!input)throw Error('Set AUDIT_DIRECTORY and AUDIT_INPUT');
const cohort=JSON.parse(fs.readFileSync(input));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const runs=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f))));
const arms=(process.env.AUDIT_ARMS||'nano-low,luna-none,luna-low').split(',').map(a=>a.trim()).filter(Boolean);
const norm=x=>String(x??'').trim();
const clock=x=>{const s=norm(x);if(!s||s==='unknown')return '';const m=s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);if(!m)return s;let h=+m[1];if(m[3])h=h%12+(/pm/i.test(m[3])?12:0);return String(h).padStart(2,'0')+':'+m[2];};
const identity=x=>[norm(x.name).toLowerCase(),norm(x.date),clock(x.startTime)].join('|');
const price=x=>typeof x.pricing==='object'?x.pricing?.price:x.price??x.pricing;
function changes(a,b){
  const out=[];
  for(const [key,x,y]of [
    ['name',norm(a.name),norm(b.name)],['date',norm(a.date),norm(b.date)],
    ['startTime',clock(a.startTime),clock(b.startTime)],['endTime',clock(a.endTime),clock(b.endTime)],
    ['venue',norm(a.venue),norm(b.venue)],['price',norm(price(a)),norm(price(b))],
    ['ticketLink',norm(a.ticketLink),norm(b.ticketLink)],['imageIndex',a.relevantImageIndex,b.relevantImageIndex],
    ['sourceType',a._sourceType,b._sourceType],['recurringPattern',norm(a.recurringPattern||'none'),norm(b.recurringPattern||'none')],
  ])if(x!==y)out.push({field:key,input:x,output:y});
  for(const field of ['timeFlags','spatial'])if(a[field]&&!b[field])out.push({field,input:'present',output:'missing'});
  return out;
}
function indexOutputs(items,source){
  const remaining=[...items];
  const outputs=source.map(a=>{let i=remaining.findIndex(b=>b._pipelineIndex===a._pipelineIndex);
    if(i<0)i=remaining.findIndex(b=>identity(a)===identity(b));return i<0?null:remaining.splice(i,1)[0];});
  return {outputs,extras:remaining};
}
const reviewed=runs.map(r=>{
  const c=cohort.find(c=>c.caseId===r.caseId);assert.ok(c);assert.equal(hash(c),r.sourceSha256);assert.equal(r.noLiveWrites,true);
  const {outputs,extras}=indexOutputs(r.items||[],c.items);
  const {outputs:production}=indexOutputs(c.productionStage4||[],c.items);
  return {caseId:c.caseId,row:c.row,postId:c.postId,arm:r.arm,repeat:r.repeat,error:r.error,
    inputCount:r.inputCount,outputCount:r.outputCount,wallMs:r.wallMs,metadata:r.metadata,extras,
    decisions:c.items.map((a,i)=>({index:i,pipelineIndex:a._pipelineIndex,name:a.name,date:a.date,startTime:a.startTime,
      kept:!!outputs[i],productionKept:!!production[i],fieldChanges:outputs[i]?changes(a,outputs[i]):[]})),
    raw:r.requests.map(q=>({httpStatus:q.httpStatus,status:q.status,incompleteDetails:q.incompleteDetails,
      inputCount:q.batchItems.length,rawCount:q.rawResult?.validatedItems?.length,
      positionalAttributionReliable:q.batchItems.length===q.rawResult?.validatedItems?.length,
      decisions:q.rawResult?.validatedItems?.map(e=>({index:e.item?._pipelineIndex,name:e.item?.name,decision:e.decision,reason:e.reason})),
      promptSha256:q.promptSha256,outputContractSha256:q.outputContractSha256})),
  };
});
const median=a=>{a=a.slice().sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
// October 9 verified legacy/Luna rates; GPT-5.4 Nano official rates checked
// October 10. Usage-priced estimates, not billed invoices.
const rates={'gpt-5-nano':{input:.05,cached:.005,write:.05,output:.4},'gpt-6-luna':{input:.1,cached:.01,write:.125,output:.5},'gpt-5.4-nano':{input:.2,cached:.02,write:.2,output:1.25}};
function cost(q,cold=false){const u=q.usage||{},r=rates[q.model];assert.ok(r,'Unknown pricing model '+q.model);const cached=cold?0:u.input_tokens_details?.cached_tokens||0;
  const write=cold?0:u.input_tokens_details?.cache_write_tokens||u.input_tokens_details?.cache_creation_tokens||0;
  return (((u.input_tokens||0)-cached-write)*r.input+cached*r.cached+write*r.write+(u.output_tokens||0)*r.output)/1e6;}
const stats={};
for(const arm of arms){const rr=runs.filter(r=>r.arm===arm),rv=reviewed.filter(r=>r.arm===arm),qq=rr.flatMap(r=>r.requests);
  stats[arm]={runs:rr.length,calls:qq.length,inputs:rr.reduce((s,r)=>s+r.inputCount,0),outputs:rr.reduce((s,r)=>s+r.outputCount,0),
    errors:rr.filter(r=>r.error).length,summedWallMs:rr.reduce((s,r)=>s+r.wallMs,0),medianWallMs:median(rr.map(r=>r.wallMs)),maxWallMs:Math.max(...rr.map(r=>r.wallMs)),
    costUsd:qq.reduce((s,q)=>s+cost(q),0),uncachedUsd:qq.reduce((s,q)=>s+cost(q,true),0),
    inputTokens:qq.reduce((s,q)=>s+(q.usage?.input_tokens||0),0),outputTokens:qq.reduce((s,q)=>s+(q.usage?.output_tokens||0),0),
    reasoningTokens:qq.reduce((s,q)=>s+(q.usage?.output_tokens_details?.reasoning_tokens||0),0),
    incompleteCalls:qq.filter(q=>q.status!=='completed').length,httpErrors:qq.filter(q=>q.httpStatus!==200).length,
    rawJsonErrors:qq.filter(q=>q.parseError).length,rawCountMismatches:qq.filter(q=>q.rawResult?.validatedItems?.length!==q.batchItems.length).length,
    fallbackRuns:rr.filter(r=>r.metadata?._validationFallbackReason).length,
    changedFields:rv.reduce((s,r)=>s+r.decisions.reduce((n,i)=>n+i.fieldChanges.length,0),0),extraItems:rv.reduce((s,r)=>s+r.extras.length,0)};
}
const comparisons=cohort.map(c=>{
  const rr=arms.map(a=>reviewed.find(r=>r.caseId===c.caseId&&r.arm===a));
  if(rr.some(r=>!r))return {caseId:c.caseId,incomplete:true};
  const signatures=rr.map(r=>JSON.stringify(r.raw.map(q=>q.promptSha256+':'+q.outputContractSha256).sort()));
  assert.ok(signatures.every(s=>s===signatures[0]),'Unequal paired prompts '+c.caseId);
  const differences=c.items.map((item,i)=>({index:i,name:item.name,date:item.date,startTime:item.startTime,
    decisions:Object.fromEntries(rr.map(r=>[r.arm,r.decisions[i].kept]))})).filter(i=>new Set(Object.values(i.decisions)).size>1);
  return {caseId:c.caseId,row:c.row,postId:c.postId,identicalPrompts:true,differences};
});
const summary={checkedAt:new Date().toISOString(),productionChanges:false,cohortCases:cohort.length,cohortItems:cohort.reduce((s,c)=>s+c.items.length,0),
  runs:runs.length,expectedRuns:cohort.length*arms.length,stats,comparisons,reviewed,
  grading:'Differences and field changes are review candidates, not automatically errors. Production Nano decisions are comparison evidence, not ground truth.'};
fs.writeFileSync(process.env.AUDIT_SUMMARY_FILE||path.join(directory,'..','stage4-full-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({runs:summary.runs,expected:summary.expectedRuns,stats,decisionDifferences:comparisons.filter(c=>c.differences?.length),
  fieldDifferences:reviewed.filter(r=>r.decisions.some(i=>i.fieldChanges.length)).map(r=>({caseId:r.caseId,arm:r.arm,changes:r.decisions.filter(i=>i.fieldChanges.length)}))},null,2));
