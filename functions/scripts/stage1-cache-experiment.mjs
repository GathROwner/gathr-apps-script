import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { createStage1EvaluationPrompt, createValidationSchema, validateContentForStage1Evaluation } from '../lib/parsing/contentValidator.js';
import { loadAndValidateManifest, assessImageAnalysis, estimateRequestCostUsd } from './stage1-evaluation-lib.mjs';

const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const argv = process.argv.slice(2);
const value = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
const out = path.resolve(value('--output') || 'artifacts/luna-stage1-cache-oct11');
const execute = argv.includes('--execute');
const auditRoot = value('--audit-root');
const cap = Number(value('--max-usd') || 1);
assert(cap > 0 && cap <= 2, 'Spend limit must be >0 and <=2 USD');
const write = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2));
const append = (name, data) => fs.appendFileSync(path.join(out, name), JSON.stringify(data) + '\n');

// Test-only transport transformation: keep the same user role, every rule, schema,
// source field, image byte and order. Only move the attachment-count instruction
// and schema around the reusable text boundary. Never import a live writer.
export function cacheLayout(request) {
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.reasoning?.effort, 'high');
  assert.equal(request.input.length, 1);
  const original = request.input[0];
  assert.equal(original.role, 'user');
  const text = original.content[0].text;
  const marker = '\n\nReturn ONLY valid JSON that matches this schema:\n';
  const schemaAt = text.lastIndexOf(marker);
  const postAt = text.indexOf('POST DETAILS:\n');
  assert(postAt > 0 && schemaAt > postAt, 'Prompt/schema layout drift');
  const ruleText = text.slice(0, postAt);
  const lines = ruleText.match(/^- ATTACHED IMAGE COUNT: .*$/gm);
  assert.equal(lines?.length, 1, 'One attachment-count instruction required');
  const countLine = lines[0];
  const rules = ruleText.replace(countLine + '\n', '');
  assert.equal(rules.length + countLine.length + 1, ruleText.length);
  const schema = text.slice(schemaAt);
  const source = text.slice(postAt, schemaAt);
  const prefix = rules + schema;
  const suffix = countLine + '\n\n' + source;
  // Every nonempty source/instruction/schema line must occur with the same
  // multiplicity. Reordering must not silently drop or duplicate a safeguard.
  const linesOf = s => s.split('\n').filter(s=>s.trim()).sort();
  assert.deepEqual(linesOf(prefix+'\n'+suffix),linesOf(text));
  const candidate = {
    ...request,
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    input: [{ role: 'user', content: [
      { type: 'input_text', text: prefix, prompt_cache_breakpoint: { mode: 'explicit' } },
      { type: 'input_text', text: suffix },
      ...original.content.slice(1),
    ] }],
  };
  assert.deepEqual(candidate.input[0].content.slice(2), original.content.slice(1));
  assert.equal(candidate.max_output_tokens, request.max_output_tokens);
  return { candidate, prefix, suffix, parts: { rules: sha(rules), countLine: sha(countLine), source: sha(source), schema: sha(schema) } };
}

function selfTest() {
  const make = n => ({ model: 'gpt-6-luna', reasoning: { effort: 'high' }, max_output_tokens: 6000,
    input: [{ role: 'user', content: [{ type: 'input_text', text: createStage1EvaluationPrompt('SOURCE '+n,n,'VENUE','2026-10-11','compact-v10') + '\n\nReturn ONLY valid JSON that matches this schema:\n' + JSON.stringify(createValidationSchema()[0].parameters,null,2) }, ...Array.from({length:n},(_,i)=>({type:'input_image',image_url:'data:image/jpeg;base64,'+i,detail:'auto'}))] }] });
  for (const n of [0,1,3,5,16]) cacheLayout(make(n));
  assert.equal(cacheLayout(make(1)).prefix, cacheLayout(make(5)).prefix);
  assert.notEqual(cacheLayout(make(0)).prefix, cacheLayout(make(1)).prefix); // caption-specific protection remains
  const r = make(1); r.input[0].content[0].text = r.input[0].content[0].text.replace('POST DETAILS:', 'DRIFT:');
  assert.throws(()=>cacheLayout(r));
  return { cases: 8, unchangedRulesAndSchema: true, unchangedImageOrder: true, sameImagePrefixAcrossCounts: true, distinctCaptionProtection: true };
}

function observedCost(usage) {
  const input = Number(usage?.input_tokens || 0), output = Number(usage?.output_tokens || 0);
  const read = Number(usage?.input_tokens_details?.cached_tokens || 0);
  const writes = usage?.input_tokens_details?.cache_write_tokens;
  assert(Number.isFinite(writes), 'API must report explicit cache writes for cost comparison');
  assert(read + writes <= input && read >= 0 && writes >= 0);
  return ((input-read-writes)*0.1 + read*0.01 + writes*0.125 + output*0.5)/1e6;
}

function cohort() {
  const {manifest,sourceRoot} = loadAndValidateManifest('test/fixtures/stage1-oct8/manifest.json');
  const historical = manifest.cases.map(c => ({...c,caseId:'oct8-'+c.caseId,
    images:c.images.map(i=>({...i,absolutePath:path.join(sourceRoot,i.path)}))}));
  assert(auditRoot, '--audit-root is required');
  const ledger = JSON.parse(fs.readFileSync(path.join(auditRoot,'ledger.json')));
  const imageManifest = JSON.parse(fs.readFileSync(path.join(auditRoot,'image-manifest.json')));
  if(argv.includes('--full-audit')) {
    const unique = [...new Map(ledger.map(s=>[s.id,s])).values()];
    const excluded=[];
    const cases=unique.flatMap(s=>{
      const images=imageManifest.filter(i=>i.row===s.row).sort((a,b)=>a.index-b.index);
      if(!s.stage1 || images.length!==s.media.length || images.some(i=>i.status!=='ok'||!fs.existsSync(i.path)) || images.length>16) {
        excluded.push({row:s.row,id:s.id,reason:!s.stage1?'no_recorded_stage1':'unavailable_or_unsupported_source_gallery'});return[];
      }
      return [{caseId:'oct11-row-'+s.row,sourceRow:s.row,postId:s.id,venue:s.venue,postedAt:s.timestamp,caption:s.caption,
        sourceTruth:{expectedDecision:'review',rationale:'Full-cohort parity screen; source adjudication required for changes, production decision is not ground truth'},
        priorProductionDecision:s.stage1.hasValidContent,
        images:images.map(i=>({sourceGalleryIndex:i.index,absolutePath:i.path,sha256:sha(fs.readFileSync(i.path)),expectedRole:'review',width:i.width,height:i.height}))}];
    });
    write('excluded.json',excluded);
    return cases;
  }
  // Frozen source-review decisions, not copied from the fresh candidate results.
  const decisions = {16:'reject',20:'accept',31:'reject',37:'accept',87:'reject',120:'accept',157:'reject',234:'accept',277:'accept',278:'reject',279:'accept',313:'accept',315:'accept',332:'accept'};
  const today = Object.entries(decisions).map(([row,decision])=>{
    const s = ledger.find(x=>x.row===Number(row)); assert(s);
    const images = imageManifest.filter(i=>i.row===s.row).sort((a,b)=>a.index-b.index);
    assert.equal(images.length,s.media.length);
    assert(images.every(i=>i.status==='ok' && fs.existsSync(i.path)),'Unavailable sources are excluded, never relabeled as text-only');
    return {caseId:'oct11-row-'+row,sourceRow:Number(row),postId:s.id,venue:s.venue,postedAt:s.timestamp,caption:s.caption,
      sourceTruth:{expectedDecision:decision,rationale:'October 11 source review; caption and ordered gallery retained for independent comparison'},
      images:images.map(i=>({sourceGalleryIndex:i.index,absolutePath:i.path,sha256:sha(fs.readFileSync(i.path)),expectedRole:'review',width:i.width,height:i.height}))};
  });
  // Ensure first two distinct image cases complete before the rest; each paired
  // request is awaited, so later candidate requests can reuse an earlier write.
  return [today[0],today[2],...historical,...today.filter((_,i)=>![0,2].includes(i))];
}

async function main() {
  const tests = selfTest();
  if(argv.includes('--self-test')) {console.log(JSON.stringify(tests));return;}
  fs.mkdirSync(out,{recursive:true});
  assert(!fs.existsSync(path.join(out,'results.jsonl')),'Choose a fresh output directory; no automatic paid replay');
  const cases = cohort();
  write('cohort.json',cases);write('offline-checks.json',tests);
  const sourceHash = sha(fs.readFileSync('lib/parsing/contentValidator.js'));
  const prefixHashes = {};
  for (const c of cases) {
    for(const i of c.images) assert.equal(sha(fs.readFileSync(i.absolutePath)),i.sha256);
    const prompt = createStage1EvaluationPrompt(c.caption,c.images.length,c.venue,c.postedAt,'compact-v10');
    const request = {model:'gpt-6-luna',reasoning:{effort:'high'},max_output_tokens:6000,input:[{role:'user',content:[{type:'input_text',text:prompt+'\n\nReturn ONLY valid JSON that matches this schema:\n'+JSON.stringify(createValidationSchema()[0].parameters,null,2)}]}]};
    prefixHashes[c.images.length ? 'image' : 'caption'] ||= sha(cacheLayout(request).prefix);
    assert.equal(prefixHashes[c.images.length ? 'image' : 'caption'],sha(cacheLayout(request).prefix));
  }
  const plan = {createdAt:new Date().toISOString(),sourceHash,cases:cases.length,images:cases.reduce((n,c)=>n+c.images.length,0),arms:['baseline','explicit-static'],callsWithoutRetries:cases.length*2,capUsd:cap,prefixHashes,model:'gpt-6-luna',effort:'high',fullGallery:true,productionInitialGalleryLimitUnchanged:true,network:'Responses endpoint only'};
  write('plan.json',plan);console.log(JSON.stringify(plan));
  if(!execute)return;
  assert(process.env.OPENAI_API_KEY,'Existing authorized OPENAI_API_KEY required');
  const networkFetch = globalThis.fetch;
  const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:240000,fetch:async(url,options)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses','No live writes or other endpoints');
    return networkFetch(url,options);
  }});
  let reserved = 0, actual = 0, requestNumber = 0;
  const records=[];
  for(let index=0;index<cases.length;index++) {
    const c=cases[index];
    const urls=c.images.map(i=>'data:image/'+(path.extname(i.absolutePath).toLowerCase()==='.png'?'png':'jpeg')+';base64,'+fs.readFileSync(i.absolutePath).toString('base64'));
    const arms=index%2 ? ['explicit-static','baseline'] : ['baseline','explicit-static'];
    await Promise.all(arms.map(async arm=>{
      const captures=[];
      const wrapper={responses:{create:async request=>{
        const estimate=estimateRequestCostUsd({model:request.model,imageCount:urls.length,maxOutputTokens:request.max_output_tokens,inputTextChars:request.input[0].content[0].text.length});
        assert(actual+reserved+estimate <= cap,'Spend cap reached');reserved+=estimate;
        const number=++requestNumber;
        const layout=cacheLayout(request);
        const body=arm==='baseline'?request:layout.candidate;
        const fingerprint={number,caseId:c.caseId,arm,kind:urls.length?'image':'caption',prefixSha256:sha(layout.prefix),parts:layout.parts,imageHashes:c.images.map(i=>i.sha256),maxOutputTokens:body.max_output_tokens,reasoning:body.reasoning,cacheOptions:body.prompt_cache_options||null};
        append('requests.jsonl',fingerprint);
        const started=Date.now();
        try {
          const response=await client.responses.create(body);
          const usd=observedCost(response.usage);actual+=usd;
          captures.push({...fingerprint,latencyMs:Date.now()-started,usd,raw:response});
          write('response-'+String(number).padStart(3,'0')+'.json',captures.at(-1));
          return response;
        } finally {reserved-=estimate;}
      }}};
      const started=Date.now();
      const run=await validateContentForStage1Evaluation(c.caption,urls,c.venue,c.postedAt,'gpt-6-luna',{
        promptVariant:'compact-v10',structuredOutput:false,reasoningEffort:'high',localGatePolicy:'source-menu-guards',client:wrapper,
      },{gptModelFast:'gpt-6-luna',stage1ModelOverride:'gpt-6-luna'});
      const result={caseId:c.caseId,arm,status:run.status,elapsedMs:Date.now()-started,expected:c.sourceTruth.expectedDecision,
        correct:c.sourceTruth.expectedDecision==='review'?null:run.status==='completed' && run.result?.hasValidContent===(c.sourceTruth.expectedDecision==='accept'),
        imageChecks:assessImageAnalysis(run.result,c.images),run,captures:captures.map(({raw,...metadata})=>({...metadata,usage:raw.usage,responseStatus:raw.status,incompleteDetails:raw.incomplete_details}))};
      records.push(result);append('results.jsonl',result);
      console.log(JSON.stringify({caseId:c.caseId,arm,status:result.status,correct:result.correct,images:c.images.length,ms:result.elapsedMs,read:result.captures.reduce((n,x)=>n+(x.usage?.input_tokens_details?.cached_tokens||0),0),usd:result.captures.reduce((n,x)=>n+x.usd,0)}));
    }));
  }
  const totals={};
  for(const arm of ['baseline','explicit-static']) {
    const rows=records.filter(r=>r.arm===arm),calls=rows.flatMap(r=>r.captures);
    totals[arm]={posts:rows.length,calls:calls.length,correct:rows.filter(r=>r.correct).length,completed:rows.filter(r=>r.status==='completed').length,
      incompleteImages:rows.filter(r=>r.imageChecks.coverageStatus==='incomplete').map(r=>r.caseId),
      usd:calls.reduce((n,x)=>n+x.usd,0),latencyMs:calls.reduce((n,x)=>n+x.latencyMs,0),
      input:calls.reduce((n,x)=>n+x.usage.input_tokens,0),output:calls.reduce((n,x)=>n+x.usage.output_tokens,0),
      reasoning:calls.reduce((n,x)=>n+(x.usage.output_tokens_details?.reasoning_tokens||0),0),
      read:calls.reduce((n,x)=>n+(x.usage.input_tokens_details?.cached_tokens||0),0),write:calls.reduce((n,x)=>n+x.usage.input_tokens_details.cache_write_tokens,0)};
  }
  const disagreements=cases.filter(c=>{
    const a=records.find(r=>r.caseId===c.caseId&&r.arm==='baseline'),b=records.find(r=>r.caseId===c.caseId&&r.arm==='explicit-static');
    return a.run.result?.hasValidContent!==b.run.result?.hasValidContent;
  }).map(c=>c.caseId);
  write('summary.json',{finishedAt:new Date().toISOString(),plan,totals,disagreements,totalUsd:actual});
  console.log(JSON.stringify({totals,disagreements,totalUsd:actual}));
}
if (!argv.includes('--import-only')) await main();
