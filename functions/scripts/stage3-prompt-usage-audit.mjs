// Offline analysis only. Reads frozen logs and request captures; makes no API/DB calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const production = process.argv[2];
const captures = process.argv[3];
const output = process.argv[4];
assert(production && captures && output, 'Usage: node stage3-prompt-usage-audit.mjs PRODUCTION CAPTURE OUTPUT');
assert(!fs.existsSync(output), 'Refuse to overwrite an existing audit');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const logs = read(path.join(production, 'logs.json')).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
const snapshots = read(path.join(production, 'snapshots.json'));
const expected = read(path.join(production, 'usage-summary.json'));
const ledger = read(path.join(production, 'ledger.json'));
const states = new Map(), calls = [];
const operations = new Map([
  ['Extracting events', 'event'], ['Extracting food specials', 'special'],
  ['Extracting calendar content', 'calendar'], ['Extracting schedule content', 'schedule'],
  ['Stage 3 extracted no items, attempting fallback extraction', 'fallback'],
]);
for (const entry of logs) {
  const payload = entry.jsonPayload;
  if (!payload) continue;
  const key = entry.labels?.execution_id;
  assert(key, 'Execution identity required for correlation');
  if (!states.has(key)) states.set(key, {row: null, pending: null, operation: null});
  const state = states.get(key), c = payload.context || {};
  const row = /^Starting processing row (\d+)$/.exec(payload.message);
  if (row) { assert(!state.pending); state.row = Number(row[1]); state.operation = null; }
  if (operations.has(payload.message)) state.operation = operations.get(payload.message);
  if (payload.message === 'Timing' && c.step === 'gpt_call' && ['eventExtractor','ocrDebugText'].includes(c.component)) {
    assert(!state.pending, 'Unpaired model timing');
    state.pending = {row: state.row, operation: state.operation, ...c, timingAt: entry.timestamp};
  }
  if (payload.message === 'GPT extraction response received (responses)') {
    assert(state.pending, 'Unpaired extraction response');
    assert(Date.parse(entry.timestamp) - Date.parse(state.pending.timingAt) < 1000, 'Ambiguous timing correlation');
    const source = ledger.find(x => x.row === state.row);
    assert(source);
    calls.push({...state.pending, timestamp: entry.timestamp, inputTokens:c.inputTokens, outputTokens:c.outputTokens,
      cachedInputTokens:c.cachedInputTokens, responseChars:c.responseLength, status:c.responseStatus,
      sourceId:source.id, venue:source.venue, reasoningTokens:null});
    state.pending = null;
  }
}
assert([...states.values()].every(s=>!s.pending));
const main = calls.filter(c=>c.component==='eventExtractor');
const ocr = calls.filter(c=>c.component==='ocrDebugText');
const sum = (xs,k) => xs.reduce((n,x)=>n+(x[k]||0),0);
for (const [xs,stage] of [[main,'stage3'],[ocr,'ocr_debug']]) {
  assert.equal(xs.length, expected.byStage[stage].calls);
  for (const k of ['inputTokens','outputTokens','cachedInputTokens']) assert.equal(sum(xs,k),expected.byStage[stage][k]);
}
const stats = values => {
  const sorted = [...values].sort((a,b)=>a-b);
  const percentile = p => sorted[Math.ceil(sorted.length*p)-1];
  return {min:sorted[0],median:percentile(.5),p90:percentile(.9),p95:percentile(.95),max:sorted.at(-1),average:values.reduce((a,b)=>a+b,0)/values.length};
};
const byOperation = {};
for (const c of main) {
  const a = byOperation[c.operation] ||= {calls:0,inputTokens:0,outputTokens:0,durationMs:0,imageAttachments:0};
  a.calls++; for (const k of ['inputTokens','outputTokens','durationMs']) a[k]+=c[k];
  a.imageAttachments += c.imageCount;
}
const byRow = ledger.filter(s=>s.usage?.byStage?.stage3).map(s=>{
  const xs=main.filter(c=>c.row===s.row);
  assert.equal(xs.length,s.usage.byStage.stage3.calls);
  const a=snapshots.find(x=>x.rowIndex===s.row).stages.find(x=>x.output?.stageArtifacts).output.stageArtifacts;
  return {row:s.row,sourceId:s.id,venue:s.venue,route:a.contentType,inputKind:a.stage3InputKind,calls:xs.length,
    inputTokens:sum(xs,'inputTokens'),outputTokens:sum(xs,'outputTokens'),durationMs:sum(xs,'durationMs'),operations:xs.map(c=>c.operation)};
});
const capturesRows=fs.readFileSync(path.join(captures,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const prompts=[];
for (const row of capturesRows.filter(r=>r.arm==='candidate')) for (const req of row.requests) {
  const blocks=req.original.input[0].content;
  const originalText=blocks.filter(b=>b.type==='input_text').map(b=>b.text).join('\n');
  const stableText=req.change.applied?req.change.body.input[0].content[0].text:null;
  const kind=originalText.startsWith('CAPTION-ONLY')?'event-caption':originalText.startsWith('Extract ONLY EVENTS')?'event-image':
    originalText.startsWith('Your job is')?'special':originalText.startsWith('Extract ALL events and specials')?'calendar':
    originalText.startsWith('Extract ALL events from this SCHEDULE')?'schedule':'auxiliary';
  prompts.push({row:row.row,kind,originalChars:originalText.length,stableChars:stableText?.length??null,
    stableWords:stableText?.trim().split(/\s+/).length??null,prefix:req.change.prefix??null,originalText,stableText});
}
const promptGroups=[...new Set(prompts.map(x=>x.kind))].map(kind=>{
  const xs=prompts.filter(x=>x.kind===kind);return {kind,samples:xs.length,originalChars:stats(xs.map(x=>x.originalChars)),
    stableChars:[...new Set(xs.map(x=>x.stableChars))],stableWords:[...new Set(xs.map(x=>x.stableWords))],prefixes:[...new Set(xs.map(x=>x.prefix))]};
});
const inputUSD=expected.byStage.stage3.usd-expected.byStage.stage3.outputTokens*.5/1e6;
const report={dataset:snapshots[0].fileId,production,sourceStage3Sha:createHash('sha256').update(fs.readFileSync('src/parsing/eventExtractor.ts')).digest('hex'),
  productionUsage:expected.byStage.stage3,inputUSD,outputUSD:expected.byStage.stage3.outputTokens*.5/1e6,
  summedCallSeconds:sum(main,'durationMs')/1000,input:stats(main.map(c=>c.inputTokens)),output:stats(main.map(c=>c.outputTokens)),
  milliseconds:stats(main.map(c=>c.durationMs)),visibleChars:stats(main.map(c=>c.responseChars)),
  reasoningSplit:'Not recorded in these production Stage 3 logs or snapshots; null is unknown, not zero.',
  byOperation,byRow,ocrCalls:ocr,promptGroups,
  highestInput:[...main].sort((a,b)=>b.inputTokens-a.inputTokens).slice(0,5),
  highestOutput:[...main].sort((a,b)=>b.outputTokens-a.outputTokens).slice(0,5),
  slowest:[...main].sort((a,b)=>b.durationMs-a.durationMs).slice(0,5)};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'production-call-ledger.json'),JSON.stringify(calls,null,2));
fs.writeFileSync(path.join(output,'prompt-texts.json'),JSON.stringify(prompts,null,2));
fs.writeFileSync(path.join(output,'analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,byRow:undefined,ocrCalls:undefined},null,2));
