// Aggregate actual read-only paired responses. This reports differences for source review,
// not an automatic declaration that either model output is correct.
import fs from 'node:fs';
import path from 'node:path';
import {resolveStage2ScoreRouting} from '../lib/parsing/stage2Routing.js';
const root=process.argv[2]||'artifacts';
const suite=process.argv[3]||'paired';
const percentile=(values,p)=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.ceil(a.length*p)-1]:null;};
const norm=v=>typeof v==='string'?v.trim().replace(/\s+/g,' '):v;
const fields=['name','date','startDate','endDate','startTime','endTime','venue','establishment','address','ticketLink','ticketPrice','price','pricing','relevantImageIndex','recurringPattern','recurrenceUntilDate','isRecurring','totalOccurrences','category','isEvent','isFoodSpecial','additionalLocation'];
const inventory=items=>(Array.isArray(items)?items:[]).map(x=>Object.fromEntries(fields.map(k=>[k,norm(x[k]??'')]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const reports=[];
for(const stage of [2,3,4,5]){
 const dir=path.resolve(root,`luna-stage${stage}-cache-oct11-${suite}`);
 if(!fs.existsSync(dir+'/results.jsonl'))continue;
 const results=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 if(stage===2){
  const cohort=JSON.parse(fs.readFileSync(dir+'/cohort.json'));
  const env=JSON.parse(fs.readFileSync(path.resolve(root,'luna-stage1-cache-release/serving-after.json'))).rows[0].env;
  for(const r of results){if(!r.output)continue;const source=cohort.find(c=>c.row===r.row);
   r.output.originalAuditRouting=r.output.routing;
   r.output.routing=resolveStage2ScoreRouting(source.caption,r.output.classification,source.stage1,env);
   r.output.route=r.output.routing.shouldUseRoutedContentType?r.output.routing.routedContentType:r.output.classification.contentType;
  }
 }
 const summaries={};
 for(const arm of ['baseline','candidate']){
  const rows=results.filter(r=>r.arm===arm),calls=rows.flatMap(r=>r.requests);
  const sum=fn=>calls.reduce((n,c)=>n+(fn(c)||0),0);
  summaries[arm]={posts:rows.length,apiCalls:calls.length,errors:rows.filter(r=>r.error).map(r=>({row:r.row,error:r.error})),
   guards:rows.filter(r=>Object.entries(r.metadata||{}).some(([k,v])=>/fallback|hold|identity|parseError/i.test(k)&&v)).map(r=>({row:r.row,metadata:r.metadata})),
   badResponses:calls.filter(c=>c.httpStatus!==200||c.status!=='completed').map(c=>({status:c.status,http:c.httpStatus,reason:c.incomplete})),
   inputTokens:sum(c=>c.usage?.input_tokens),cachedReadTokens:sum(c=>c.usage?.input_tokens_details?.cached_tokens),
   cacheWriteTokens:sum(c=>c.usage?.input_tokens_details?.cache_write_tokens),cacheWriteKnownCalls:calls.filter(c=>Number.isFinite(c.usage?.input_tokens_details?.cache_write_tokens)).length,
   outputTokens:sum(c=>c.usage?.output_tokens),reasoningTokens:sum(c=>c.usage?.output_tokens_details?.reasoning_tokens),
   usd:sum(c=>c.usd),summedCallSeconds:sum(c=>c.ms)/1000,medianSeconds:percentile(calls.map(c=>c.ms/1000),.5),p95Seconds:percentile(calls.map(c=>c.ms/1000),.95),
   models:[...new Set(calls.map(c=>c.model+':'+c.effort))],prefixes:[...new Set(calls.filter(c=>c.applied).map(c=>c.prefix))],
   noApiRows:rows.filter(r=>r.requests.length===0).map(r=>r.row)};
 }
 const pairedRows=[...new Set(results.map(r=>r.row))].filter(row=>results.filter(r=>r.row===row).length===2);
 const comparisons=pairedRows.map(row=>{
  const b=results.find(r=>r.row===row&&r.arm==='baseline'),c=results.find(r=>r.row===row&&r.arm==='candidate');
  if(stage===2){
   const project=x=>({passed:x?.passed,route:x?.route,estimatedItems:x?.classification?.estimatedItemCount,hasEvents:x?.classification?.contentAnalysis?.hasEvents,hasFoodSpecials:x?.classification?.contentAnalysis?.hasFoodSpecials,hasMultipleItems:x?.classification?.contentAnalysis?.hasMultipleItems});
   const baseline=project(b.output),candidate=project(c.output);
   return {row,baseline,candidate,decisionSame:baseline.passed===candidate.passed,routeSame:baseline.route===candidate.route,exact:JSON.stringify(baseline)===JSON.stringify(candidate),errors:[b.error,c.error].filter(Boolean)};
  }
  const baseline=inventory(b.output),candidate=inventory(c.output);
  return {row,baselineCount:baseline.length,candidateCount:candidate.length,exact:JSON.stringify(baseline)===JSON.stringify(candidate),baseline,candidate,baselineMetadata:b.metadata,candidateMetadata:c.metadata,errors:[b.error,c.error].filter(Boolean)};
 });
 const report={stage,complete:fs.existsSync(dir+'/summary.json'),summaries,pairedRows:pairedRows.length,comparisons};
 fs.writeFileSync(dir+'/analysis.json',JSON.stringify(report,null,2));reports.push(report);
 console.log(JSON.stringify({stage,complete:report.complete,summaries,comparison:{paired:pairedRows.length,exact:comparisons.filter(c=>c.exact).length,different:comparisons.filter(c=>!c.exact).map(c=>c.row),countChanges:comparisons.filter(c=>c.baselineCount!==c.candidateCount).map(c=>[c.row,c.baselineCount,c.candidateCount]),decisionChanges:comparisons.filter(c=>c.decisionSame===false).map(c=>c.row),routeChanges:comparisons.filter(c=>c.routeSame===false).map(c=>c.row)}}));
}
fs.writeFileSync(path.resolve(root,`luna-other-stages-cache-oct11-${suite}-analysis.json`),JSON.stringify(reports,null,2));
