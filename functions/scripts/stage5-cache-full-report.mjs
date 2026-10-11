// Read-only validation of the full Stage 5 cache comparison, including raw contracts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculateEndDate} from '../lib/utils/dateTime.js';
const dir=process.argv[2]||'artifacts/luna-stage5-cache-oct11-full';
const cohort=JSON.parse(fs.readFileSync(dir+'/cohort.json'));
const runs=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const norm=v=>String(v??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
const clock=v=>{const s=String(v||'').trim();if(/^(unknown|n\/a)$/i.test(s))return '';const m=s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);if(!m)return s;let h=Number(m[1]);if(m[3])h=h%12+(/pm/i.test(m[3])?12:0);return String(h).padStart(2,'0')+':'+m[2];};
const shiftedDate=(iso,days)=>{const date=new Date(iso+'T12:00:00Z');assert(Number.isFinite(date.getTime()));date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
function expand(events){return events.flatMap(e=>{
 const count=Number(e.totalOccurrences||1),pattern=String(e.recurringPattern||'');
 if(count<2||(!pattern.startsWith('weekly_')&&pattern!=='daily'))return[e];
 assert(Number.isInteger(count)&&count<=200,'Bounded recurrence expansion only');
 const step=pattern==='daily'?1:7*Number(e.recurringWeekInterval||1);
 return Array.from({length:count},(_,i)=>({...e,startDate:shiftedDate(e.startDate,step*i),...(e.endDate?{endDate:shiftedDate(e.endDate,step*i)}:{})}));
});}
const identity=e=>[norm(e.name),e.startDate||e.date,clock(e.startTime)].join('|');
// Mirror the existing full-parser write path: derive an end date ONLY when blank.
// A model-supplied same-day date is preserved there, even if its clock is overnight.
const writeEndDate=e=>e.endDate||(e.startDate&&clock(e.startTime)&&clock(e.endTime)?calculateEndDate(e.startDate,clock(e.startTime),clock(e.endTime)):e.startDate);
assert.equal(writeEndDate({startDate:'2026-10-10',startTime:'22:00',endTime:'02:00',endDate:''}),'2026-10-11');
assert.equal(writeEndDate({startDate:'2026-10-10',startTime:'20:00',endTime:'02:00',endDate:'2026-10-10'}),'2026-10-10');
const value=(e,k)=>k==='venue'?e.venue||e.establishment||'':k==='endTime'?clock(e.endTime):k==='ticketPrice'?e.ticketPrice:k==='endDate'?writeEndDate(e):k==='rawEndDate'?e.endDate:e[k];
const compareFields=['endDate','rawEndDate','endTime','venue','address','ticketLink','ticketPrice','relevantImageIndex','category','isEvent','isFoodSpecial','isRecurring','recurringPattern','recurrenceUntilDate','totalOccurrences'];
const checks=runs.map(run=>{
 const source=cohort.find(c=>c.row===run.row),events=run.output||[],expanded=expand(events),remaining=[...expanded],missing=[],sourceChanges=[],rawChecks=[];
 for(const q of run.requests){
  const raw=JSON.parse(fs.readFileSync(dir+`/response-${run.row}-${run.arm}-${run.requests.indexOf(q)+1}.json`));
  const text=(raw.raw.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  let parsed;try{parsed=JSON.parse(text);}catch{}
  const list=parsed?.formattedEvents||[],expected=q.batchItems.length;
  const indices=list.map(e=>e.sourceItemIndex).sort((a,b)=>a-b);
  rawChecks.push({call:q.number,inputCount:expected,outputCount:list.length,parseError:!parsed,indicesValid:JSON.stringify(indices)===JSON.stringify(Array.from({length:expected},(_,i)=>i))});
 }
 for(const input of source.sourceStage4){
  const at=remaining.findIndex(e=>identity(e)===identity(input));
  if(at<0){missing.push({name:input.name,date:input.date,startTime:input.startTime});continue;}
  const e=remaining.splice(at,1)[0];
  const price=input.price||input.pricing?.price||(typeof input.pricing==='string'?input.pricing:'');
  const expected={endTime:clock(input.endTime),venue:input.venue,ticketLink:input.ticketLink,relevantImageIndex:input.relevantImageIndex,ticketPrice:price};
  const start=clock(input.startTime),end=clock(input.endTime);
  if(/^\d{4}-\d{2}-\d{2}$/.test(input.date)&&/^\d{2}:\d{2}$/.test(start)&&/^\d{2}:\d{2}$/.test(end)&&end<start){
   expected.endDate=input.endDate||shiftedDate(input.date,1);
  }
  for(const [field,v] of Object.entries(expected)){
   if(v==null||(v===''&&field!=='endTime'))continue;
   const actual=value(e,field),equal=field==='ticketPrice'?norm(v)===norm(actual):field==='venue'?norm(v)===norm(actual):v===actual;
   if(!equal)sourceChanges.push({name:input.name,date:input.date,field,expected:v,actual});
  }
  if(input._sourceType==='special'&&e.isFoodSpecial!=='Yes')sourceChanges.push({name:input.name,field:'isFoodSpecial',expected:'Yes',actual:e.isFoodSpecial});
 }
 return {row:run.row,arm:run.arm,inputCount:source.sourceStage4.length,finalCount:events.length,expandedCount:expanded.length,rawChecks,missing,extra:remaining.map(e=>({name:e.name,date:e.startDate,time:e.startTime})),sourceChanges,metadata:run.metadata,error:run.error};
});
const comparisons=cohort.map(source=>{
 const b=runs.find(x=>x.row===source.row&&x.arm==='baseline'),c=runs.find(x=>x.row===source.row&&x.arm==='candidate');
 if(!b||!c)return {row:source.row,incomplete:true};
 const baseline=expand(b.output||[]),candidate=expand(c.output||[]),remaining=[...candidate],changes=[],missing=[];
 for(const e of baseline){const at=remaining.findIndex(x=>identity(e)===identity(x));if(at<0){missing.push(identity(e));continue;}const x=remaining.splice(at,1)[0];
  for(const field of compareFields)if(JSON.stringify(value(e,field)??'')!==JSON.stringify(value(x,field)??''))changes.push({name:e.name,date:e.startDate,field,baseline:value(e,field),candidate:value(x,field)});
 }
 return {row:source.row,baselineFinalCount:b.output?.length,candidateFinalCount:c.output?.length,baselineExpanded:baseline.length,candidateExpanded:candidate.length,missing,extra:remaining.map(identity),changes};
});
const requestParity=cohort.map(source=>{
 const pair=['baseline','candidate'].map(arm=>runs.find(r=>r.row===source.row&&r.arm===arm));
 const hashes=pair.map(r=>(r?.requests||[]).map(q=>q.originalHash).sort());
 return {row:source.row,complete:pair.every(Boolean),sameOriginalRequests:JSON.stringify(hashes[0])===JSON.stringify(hashes[1])};
});
const report={complete:fs.existsSync(dir+'/summary.json'),sources:cohort.length,suppliedItems:cohort.reduce((n,c)=>n+c.sourceStage4.length,0),runs:runs.length,
 arms:Object.fromEntries(['baseline','candidate'].map(arm=>{const c=checks.filter(x=>x.arm===arm);return[arm,{posts:c.length,finalRecords:c.reduce((n,x)=>n+x.finalCount,0),expandedOccurrences:c.reduce((n,x)=>n+x.expandedCount,0),rawCalls:c.reduce((n,x)=>n+x.rawChecks.length,0),rawFailures:c.flatMap(x=>x.rawChecks.filter(q=>q.parseError||!q.indicesValid).map(q=>({row:x.row,...q}))),missing:c.flatMap(x=>x.missing.map(m=>({row:x.row,...m}))),extra:c.flatMap(x=>x.extra.map(m=>({row:x.row,...m}))),sourceChanges:c.flatMap(x=>x.sourceChanges.map(m=>({row:x.row,...m})))}];})),checks,comparisons,requestParity};
const earlier=JSON.parse(fs.readFileSync('artifacts/luna-stage5-cache-oct11-paired/cohort.json')).map(x=>x.row);
report.costSubsets=Object.fromEntries(['all','new28','previous15'].map(subset=>[subset,Object.fromEntries(['baseline','candidate'].map(arm=>{
 const selected=runs.filter(r=>r.arm===arm&&(subset==='all'||(subset==='new28'?!earlier.includes(r.row):earlier.includes(r.row)))),calls=selected.flatMap(r=>r.requests);
 return [arm,{posts:selected.length,calls:calls.length,usd:calls.reduce((n,q)=>n+(q.usd||0),0),seconds:calls.reduce((n,q)=>n+q.ms/1000,0),inputTokens:calls.reduce((n,q)=>n+q.usage.input_tokens,0),outputTokens:calls.reduce((n,q)=>n+q.usage.output_tokens,0),cachedReadTokens:calls.reduce((n,q)=>n+(q.usage.input_tokens_details?.cached_tokens||0),0),cacheWriteTokens:calls.reduce((n,q)=>n+(q.usage.input_tokens_details?.cache_write_tokens||0),0)}];
}))]));
fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({complete:report.complete,sources:report.sources,suppliedItems:report.suppliedItems,runs:report.runs,arms:report.arms,different:comparisons.filter(x=>x.incomplete||x.missing.length||x.extra.length||x.changes.length).map(x=>({row:x.row,missing:x.missing,extra:x.extra,fields:[...new Set(x.changes?.map(c=>c.field))]}))},null,2));
