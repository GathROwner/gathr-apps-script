// Read-only analysis of retained API evidence; no model calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='artifacts/luna-stage2-cache-release';
const read=p=>JSON.parse(fs.readFileSync(p));
const lines=p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const results=lines(root+'/classify-api/results.jsonl'),cohort=read(root+'/classify-api/cohort.json');
const downstream=lines(root+'/downstream-api/results.jsonl');
const armSummary=(rs)=>{
 const calls=rs.flatMap(r=>r.calls);
 assert(rs.every(r=>!r.error));assert(calls.every(c=>c.httpStatus===200&&c.status==='completed'&&!c.incomplete));
 return {posts:rs.length,calls:calls.length,usd:calls.reduce((n,c)=>n+c.usd,0),seconds:calls.reduce((n,c)=>n+c.ms,0)/1000,
 inputTokens:calls.reduce((n,c)=>n+c.usage.input_tokens,0),cachedReadTokens:calls.reduce((n,c)=>n+(c.usage.input_tokens_details?.cached_tokens||0),0),
 cacheWriteTokens:calls.reduce((n,c)=>n+c.usage.input_tokens_details.cache_write_tokens,0),outputTokens:calls.reduce((n,c)=>n+c.usage.output_tokens,0),
 reasoningTokens:calls.reduce((n,c)=>n+(c.usage.output_tokens_details?.reasoning_tokens||0),0)};
};
const pairs=cohort.map(s=>{
 const b=results.find(r=>r.row===s.row&&r.arm==='baseline'),c=results.find(r=>r.row===s.row&&r.arm==='candidate');assert(b&&c);
 assert.equal(b.output.passed,c.output.passed,'Decision change needs source review');
 return {row:s.row,passed:b.output.passed,baselineRoute:b.output.route,candidateRoute:c.output.route,
 sameCalls:JSON.stringify(b.calls.map(r=>r.effort))===JSON.stringify(c.calls.map(r=>r.effort))};
});
const matchingRows=pairs.filter(p=>p.sameCalls).map(p=>p.row);
// Source-backed assertions across every previously observed differing route.
for(const r of downstream){
 assert(!r.error);assert.equal(r.output.guard._validationFallbackReason,undefined);
 assert(Object.values(r.output.guard).every(v=>v===0),'Unexpected validation fallback or override');
 assert(r.calls.every(c=>c.httpStatus===200&&c.status==='completed'&&!c.incomplete));
 const events=r.output.events;
 for(const e of events){assert(/founders|local pub|tipsy farmers/i.test(e.establishment));assert(Number.isInteger(e.relevantImageIndex));}
 if(r.row===64){assert.equal(events.length,1);assert.match(events[0].name,/harvest fest/i);assert.equal(events[0].startDate,'2026-10-17');assert.equal(events[0].startTime,'15:00');assert.equal(events[0].endTime,'20:00');assert.equal(events[0].recurringPattern,'none');}
 if(r.row===65){assert.equal(events.length,2);for(const [words,time,image] of [['bruins','14:00',0],['oilers','17:00',1]]){const e=events.find(e=>e.name.toLowerCase().includes(words));assert(e);assert.equal(e.startDate,'2026-10-10');assert.equal(e.startTime,time);assert.equal(e.relevantImageIndex,image);assert.equal(e.endTime,'');}}
 if(r.row===66){assert.equal(events.length,2);for(const [day,date] of [['saturday','2026-10-10'],['sunday','2026-10-11']]){const e=events.find(e=>e.recurringPattern==='weekly_'+day);assert(e);assert.equal(e.startDate,date);assert.equal(e.startTime,'10:00');assert.equal(e.endTime,'14:00');assert.equal(e.isFoodSpecial,'Yes');}}
 if(r.row===120){assert.equal(events.length,1);const e=events[0];assert.match(e.name,/turkey.*buffet/i);assert.equal(e.startDate,'2026-10-11');assert.equal(e.startTime,'16:30');assert.equal(e.endTime,'18:30');assert.equal(e.isFoodSpecial,'Yes');assert.equal(e.isEvent,'No');}
}
assert.equal(downstream.length,8);
for(const p of pairs.filter(p=>p.baselineRoute!==p.candidateRoute)){assert(downstream.some(r=>r.row===p.row&&r.arm===p.baselineRoute));assert(downstream.some(r=>r.row===p.row&&r.arm===p.candidateRoute));}
const baseline=armSummary(results.filter(r=>r.arm==='baseline')),candidate=armSummary(results.filter(r=>r.arm==='candidate'));
const matchedBaseline=armSummary(results.filter(r=>r.arm==='baseline'&&matchingRows.includes(r.row))),matchedCandidate=armSummary(results.filter(r=>r.arm==='candidate'&&matchingRows.includes(r.row)));
const report={complete:true,sourceCases:cohort.length,stage1Passed:cohort.filter(c=>c.stage1?.hasValidContent).length,excluded:read(root+'/classify-api/excluded.json'),
 baseline,candidate,savingPercent:100*(1-candidate.usd/baseline.usd),sameCallPath:{baseline:matchedBaseline,candidate:matchedCandidate,savingPercent:100*(1-matchedCandidate.usd/matchedBaseline.usd)},pairs,
 downstream:{posts:4,routes:8,calls:downstream.flatMap(r=>r.calls).length,usd:downstream.flatMap(r=>r.calls).reduce((n,c)=>n+c.usd,0),sourceAssertionsPassed:true,observedRecords:downstream.reduce((n,r)=>n+r.output.events.length,0)}};
fs.writeFileSync(root+'/analysis.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
