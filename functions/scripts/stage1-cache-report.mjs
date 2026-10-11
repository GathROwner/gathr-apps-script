import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { selectLunaDenseFrameIndices } from '../lib/parsing/stage2Routing.js';
const root=path.resolve(process.argv[2]||'artifacts/luna-stage1-cache-oct11');
const rows=fs.readFileSync(path.join(root,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const cohort=JSON.parse(fs.readFileSync(path.join(root,'cohort.json')));
const plan=JSON.parse(fs.readFileSync(path.join(root,'plan.json')));
assert.equal(new Set(cohort.map(c=>c.caseId)).size,cohort.length,'Duplicate cohort source');
assert.equal(new Set(rows.map(r=>r.caseId+'|'+r.arm)).size,rows.length,'Duplicate paired result');
assert(rows.every(r=>cohort.some(c=>c.caseId===r.caseId)&&plan.arms.includes(r.arm)),'Unexpected source or arm');
const priorRoot=process.argv[3] ? path.resolve(process.argv[3]) : null;
const priorIds=new Set(priorRoot ? JSON.parse(fs.readFileSync(path.join(priorRoot,'cohort.json'))).map(c=>c.caseId) : []);
const auditRoot=process.argv[4] ? path.resolve(process.argv[4]) : null;
const snapshots=auditRoot ? JSON.parse(fs.readFileSync(path.join(auditRoot,'snapshots.json'))) : [];
const fields=['hasCalendarGrid','hasDenseText','hasMultipleEventListings','isPromotionalPhoto','recommendsTiling'];
const percentile=(a,p)=>{a=[...a].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]??null;};
const cost=c=>{const u=c.usage,d=u.input_tokens_details;return {input:((u.input_tokens-d.cached_tokens-d.cache_write_tokens)*.1+d.cached_tokens*.01+d.cache_write_tokens*.125)/1e6,output:u.output_tokens*.5/1e6};};
const grouped={};
for(const arm of plan.arms){
  const a=rows.filter(r=>r.arm===arm),calls=a.flatMap(r=>r.captures);
  const byKind={};
  for(const kind of ['image','caption']){
    const selected=calls.filter(c=>c.kind===kind);
    byKind[kind]={calls:selected.length,cold:selected.filter(c=>!c.usage.input_tokens_details.cached_tokens).map(c=>c.caseId),
      warm:selected.filter(c=>c.usage.input_tokens_details.cached_tokens>0).length,
      inputUsd:selected.reduce((n,c)=>n+cost(c).input,0),outputUsd:selected.reduce((n,c)=>n+cost(c).output,0),
      latencyMs:selected.reduce((n,c)=>n+c.latencyMs,0)};
  }
  const freshRows=a.filter(r=>!priorIds.has(r.caseId)),freshCalls=freshRows.flatMap(r=>r.captures);
  grouped[arm]={posts:a.length,calls:calls.length,correct:a.filter(r=>r.correct).length,
    notInPriorSuite:{posts:freshRows.length,calls:freshCalls.length,inputUsd:freshCalls.reduce((n,c)=>n+cost(c).input,0),outputUsd:freshCalls.reduce((n,c)=>n+cost(c).output,0),totalUsd:freshCalls.reduce((n,c)=>n+c.usd,0),sumMs:freshCalls.reduce((n,c)=>n+c.latencyMs,0)},
    scoredPosts:a.filter(r=>r.correct!=null).length,inputUsd:calls.reduce((n,c)=>n+cost(c).input,0),outputUsd:calls.reduce((n,c)=>n+cost(c).output,0),
    totalUsd:calls.reduce((n,c)=>n+c.usd,0),sumMs:calls.reduce((n,c)=>n+c.latencyMs,0),
    medianMs:percentile(calls.map(c=>c.latencyMs),.5),p95Ms:percentile(calls.map(c=>c.latencyMs),.95),byKind,
    incomplete:a.filter(r=>r.status!=='completed'||r.run.noImageFallbackUsed).map(r=>r.caseId),
    responseAnomalies:calls.filter(c=>c.responseStatus!=='completed'||c.incompleteDetails).map(c=>({caseId:c.caseId,status:c.responseStatus,incomplete:c.incompleteDetails})),
    coverageFailures:a.filter(r=>r.imageChecks.coverageStatus==='incomplete').map(r=>r.caseId),
    semanticChecks:a.filter(r=>r.imageChecks.semanticMismatchedIndexes.length).map(r=>({caseId:r.caseId,indexes:r.imageChecks.semanticMismatchedIndexes})),
    layoutChecks:a.flatMap(r=>r.imageChecks.expectedLayoutChecks.filter(x=>!x.matches).map(x=>({caseId:r.caseId,...x}))),
    tokenTotals:calls.reduce((t,c)=>{const u=c.usage; t.input+=u.input_tokens;t.output+=u.output_tokens;t.read+=u.input_tokens_details.cached_tokens;t.write+=u.input_tokens_details.cache_write_tokens;t.reasoning+=u.output_tokens_details?.reasoning_tokens||0;return t;},{input:0,output:0,read:0,write:0,reasoning:0})};
}
const comparisons=cohort.map(c=>{
  const a=rows.find(r=>r.caseId===c.caseId&&r.arm==='baseline'),b=rows.find(r=>r.caseId===c.caseId&&r.arm==='explicit-static');
  if(!a||!b)return{caseId:c.caseId,pending:true};
  assert.deepEqual(a.captures[0].parts,b.captures[0].parts);
  assert.deepEqual(a.captures[0].imageHashes,b.captures[0].imageHashes);
  const differences=[];
  for(const image of c.images){
    const ai=a.run.result?.imageAnalysis.find(i=>i.imageIndex===image.sourceGalleryIndex),bi=b.run.result?.imageAnalysis.find(i=>i.imageIndex===image.sourceGalleryIndex);
    const changed=fields.filter(f=>ai?.imageComplexity?.[f]!==bi?.imageComplexity?.[f]);
    if(changed.length)differences.push({index:image.sourceGalleryIndex,changed,baseline:ai,candidate:bi});
  }
  const snapshot=[...snapshots].reverse().find(s=>s.rowIndex===c.sourceRow && String(s.uniqueId)===String(c.postId));
  const artifacts=snapshot?.stages?.find(s=>s.stage==='format')?.output?.stageArtifacts;
  const recordedContentType=artifacts?.contentType || null;
  const frames=artifacts?.imageFrameManifest || c.images.map(i=>({kind:'whole',sourceGalleryIndex:i.sourceGalleryIndex}));
  const denseA=selectLunaDenseFrameIndices(a.run.result,frames),denseB=selectLunaDenseFrameIndices(b.run.result,frames);
  return {caseId:c.caseId,truth:c.sourceTruth.expectedDecision,sameDecision:a.run.result?.hasValidContent===b.run.result?.hasValidContent,
    priorProductionDecision:c.priorProductionDecision ?? null,
    baselineDecision:a.run.result?.hasValidContent ?? null,candidateDecision:b.run.result?.hasValidContent ?? null,
    recordedContentType,baselineDenseFrameIndices:denseA,candidateDenseFrameIndices:denseB,sameDenseFrameSelection:JSON.stringify(denseA)===JSON.stringify(denseB),
    recordedCalendarAuditSelectionChanged:recordedContentType==='CALENDAR' && a.run.result?.hasValidContent && b.run.result?.hasValidContent && JSON.stringify(denseA)!==JSON.stringify(denseB),
    baselineCorrect:a.correct,candidateCorrect:b.correct,baselineMs:a.elapsedMs,candidateMs:b.elapsedMs,layoutDifferences:differences,
    baselineReason:a.run.result?.reason,candidateReason:b.run.result?.reason};
});
const b=grouped.baseline,c=grouped['explicit-static'];
const report={generatedAt:new Date().toISOString(),complete:rows.length===cohort.length*2,grouped,
  gains:{totalCostPercent:100*(1-c.totalUsd/b.totalUsd),inputCostPercent:100*(1-c.inputUsd/b.inputUsd),summedTimePercent:100*(1-c.sumMs/b.sumMs)},
  comparisons,wrongOrChanged:comparisons.filter(r=>r.pending||!r.sameDecision||r.baselineCorrect===false||r.candidateCorrect===false),
  layoutDifferences:comparisons.filter(r=>r.layoutDifferences?.length),denseFrameDifferences:comparisons.filter(r=>r.sameDenseFrameSelection===false),
  priorProductionDifferences:comparisons.filter(r=>!r.pending && r.priorProductionDecision!=null && (r.priorProductionDecision!==r.baselineDecision || r.priorProductionDecision!==r.candidateDecision)),
  recordedCalendarAuditDifferences:comparisons.filter(r=>r.recordedCalendarAuditSelectionChanged)};
fs.writeFileSync(path.join(root,'analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({complete:report.complete,grouped,gains:report.gains,wrongOrChanged:report.wrongOrChanged,layoutDifferenceCases:report.layoutDifferences.map(r=>r.caseId)},null,2));
