// Frozen quality gate. No network or live writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.argv[2];assert(dir);
const cohort=JSON.parse(fs.readFileSync(dir+'/cohort.json'));
const rows=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.arm==='compact');
assert.equal(rows.length,135);assert.equal(cohort.reduce((s,c)=>s+c.items.length,0),425);
assert.equal(new Set(rows.map(r=>r.caseId)).size,135);
for(const row of rows){
 assert(!row.error,row.caseId);assert(!row.metadata._compactValidationHold,row.caseId+': unresolved hold');
 assert(!row.metadata._validationFallbackReason,row.caseId+': fail-open fallback');
 const source=cohort.find(c=>c.caseId===row.caseId);
 assert.equal(new Set(row.output.map(i=>i._pipelineIndex)).size,row.output.length);
 for(const item of row.output){
  const original=source.items.find(i=>i._pipelineIndex===item._pipelineIndex);assert(original);
  // Existing deterministic Sunday sibling alignment is intentionally retained.
  for(const field of ['name','description','startTime','endTime','venue','ticketLink','price','pricing','relevantImageIndex','spatial'])
   assert.deepEqual(item[field],original[field],row.caseId+': source '+field+' changed');
  if(row.caseId!=='oct11-66')assert.equal(item.date,original.date,row.caseId+': source date changed');
  if(item._stage4NeedsTimeEnrichment){assert(['','unknown'].includes(String(item.startTime??'').toLowerCase()));}
 }
 for(const q of row.requests){assert.equal(q.httpStatus,200);assert.equal(q.usage?.input_tokens_details?.cache_write_tokens,0);}
}
const expected={'oct10-32':13,'oct10-37':9,'oct11-76':9,'oct10-166':6,'oct10-234':1,
 'oct10-270':0,'oct10-272':0,'oct10-314':1,'oct11-27':1,'oct11-165':0};
for(const [id,count] of Object.entries(expected))assert.equal(rows.find(r=>r.caseId===id).output.length,count,id+': reviewed inventory');
for(const id of ['oct10-294','oct11-285'])assert(rows.find(r=>r.caseId===id).output.every(i=>i.recurringPattern==='none'),id+': annual recurrence');
const pool=rows.find(r=>r.caseId==='oct10-166');assert(pool.output.every(i=>!i.name.includes('closed')));
const result={complete:true,networkCalls:0,sources:rows.length,inputItems:425,kept:rows.reduce((s,r)=>s+r.output.length,0),
 pendingTimeEnrichment:rows.flatMap(r=>r.output).filter(i=>i._stage4NeedsTimeEnrichment).length,reviewedInventoryControls:Object.keys(expected).length};
fs.writeFileSync(dir+'/release-quality-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
