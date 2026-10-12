import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {bindCompactStage4Sources, compactStage4Enabled, compactStage4Prompt, parseCompactStage4Response, getCompactStage4Hold, removeExactCompactDuplicates} from '../lib/parsing/compactStage4.js';

process.env.OPENAI_API_KEY='offline-stage4-tests-not-a-key';
process.env.STAGE4_RESPONSES_REASONING_EFFORT='low';
process.env.STAGE4_RESPONSES_MAX_OUTPUT_TOKENS='32000';
delete process.env.STAGE4_COMPACT_VALIDATION_ENABLED;
delete process.env.IMAGE_UPLOAD_URL; delete process.env.IMAGE_DELETE_URL;
let requests=[],respond;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses','No real network or writer endpoints');
  const body=JSON.parse(options.body);requests.push(body);
  const r=await respond(body,requests.length);
  if(r instanceof Response)return r;
  return new Response(JSON.stringify({id:'test-'+requests.length,status:'completed',...r,
    output:r.output||[{type:'message',role:'assistant',content:[{type:'output_text',text:r.text}]}],
    usage:{input_tokens:10,output_tokens:10,total_tokens:20,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0}}}),
  {status:200,headers:{'content-type':'application/json'}});
};
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation}=await import('../lib/parsing/secondaryValidator.js');
const config={stage4ModelOverride:'gpt-5-nano',stage4BatchSize:15,stage4BatchConcurrency:2,stage4CompactValidation:true};
const item=(index,extra={})=>({name:'Concert '+index,date:'2026-10-17',startTime:'20:00',endTime:'22:00',venue:'Test venue',
  description:'Public concert',recurringPattern:'none',ticketLink:'https://example.com/tickets?a=1&b=2',price:'$20',
  relevantImageIndex:2,spatial:{kind:'single_location',locations:['Test venue']},_pipelineIndex:index,...extra});
const decision=(source,changes={})=>({sourceItemIndex:source._pipelineIndex,
  sourceIdentity:Object.fromEntries(['name','date','startTime','venue'].map(k=>[k,String(source[k]??'')])),decision:'KEPT',reason:'Dated public event with a start time.',
  corrections:{recurringPattern:null,correctionReason:''},...changes});
const text=ds=>JSON.stringify({decisions:ds});
const inputItems=body=>JSON.parse(body.input[0].content[0].text.split('ITEMS TO VALIDATE:\n')[1].split('\n\nIMPORTANT CONTEXT:')[0]);
const run=async(items,handler,options={})=>{requests=[];respond=handler;return performSecondaryValidation(items,'Test venue','2026-10-10T12:00:00Z',{...config,...options});};

test('switch defaults off, exact env true enables it, explicit false overrides env',()=>{
  assert.equal(compactStage4Enabled({}),false);
  process.env.STAGE4_COMPACT_VALIDATION_ENABLED='TRUE';assert.equal(compactStage4Enabled({}),false);
  process.env.STAGE4_COMPACT_VALIDATION_ENABLED='true';assert.equal(compactStage4Enabled({}),true);
  assert.equal(compactStage4Enabled({stage4CompactValidation:false}),false);
  delete process.env.STAGE4_COMPACT_VALIDATION_ENABLED;
  const prefix='Source quotes CRITICAL JSON FORMATTING REQUIREMENTS: as text.\nVALIDATION RULES: retain these.\n';
  assert(compactStage4Prompt(prefix+'CRITICAL JSON FORMATTING REQUIREMENTS: old output').startsWith(prefix));
});

test('reordered decisions bind to source identity and preserve every original field',()=>{
  const original=[item(17),item(23)];const saved=structuredClone(original);
  const result=parseCompactStage4Response(text(original.slice().reverse().map(i=>decision(i))),original);
  assert.deepEqual(result.validatedItems.map(x=>x.item),saved);
  result.validatedItems[0].item.spatial.kind='unknown';assert.deepEqual(original,saved);
  assert.deepEqual(bindCompactStage4Sources([{name:'No index'}]),[{name:'No index',_pipelineIndex:1}]);
  assert.throws(()=>bindCompactStage4Sources([item(1),item(1)]),/invalid_input_source_identity/);
});

test('exact timed one-off duplicate guard preserves differing dates, audiences, links, images and untimed items',()=>{
  const a=item(1),b={...structuredClone(a),_pipelineIndex:2};
  assert.deepEqual(removeExactCompactDuplicates([a,b]),[a]);
  for(const extra of [{date:'2026-10-18'},{startTime:'21:00'},{description:'Different age group'},
    {ticketLink:'https://example.com/other'},{relevantImageIndex:3},{recurringPattern:'weekly_saturday'}]){
    assert.equal(removeExactCompactDuplicates([a,{...b,...extra}]).length,2);
  }
  assert.equal(removeExactCompactDuplicates([{...a,startTime:'unknown'},{...b,startTime:'unknown'}]).length,2);
});

test('exact duplicate guard applies across batch boundaries without changing source IDs',async()=>{
  const sources=Array.from({length:16},(_,n)=>item(n+1));sources[15]={...structuredClone(sources[0]),_pipelineIndex:16};
  const result=await run(sources,body=>({text:text(inputItems(body).map(i=>decision(i)))}));
  assert.equal(result.length,15);assert.equal(requests.length,2);assert(!result.some(i=>i._pipelineIndex===16));
});

for(const [label,mutate,code] of [
  ['missing entry',ds=>ds.slice(1),'response_count_mismatch'],
  ['duplicate entry',ds=>[ds[0],ds[0]],'duplicate_source_identity'],
  ['foreign batch entry',ds=>[ds[0],{...ds[1],sourceItemIndex:999}],'foreign_source_identity'],
  ['string index',ds=>[{...ds[0],sourceItemIndex:'1'},ds[1]],'foreign_source_identity'],
  ['shifted identity',ds=>[{...ds[0],sourceIdentity:ds[1].sourceIdentity},ds[1]],'source_identity_mismatch'],
  ['invalid decision',ds=>[{...ds[0],decision:'maybe'},ds[1]],'invalid_decision'],
  ['item overwrite',ds=>[{...ds[0],item:{date:'2027-01-01'}},ds[1]],'invalid_decision_shape'],
  ['date correction',ds=>[{...ds[0],corrections:{...ds[0].corrections,date:'2027-01-01'}},ds[1]],'invalid_correction'],
  ['invalid recurrence',ds=>[{...ds[0],corrections:{recurringPattern:'weekly',correctionReason:'Change'}},ds[1]],'invalid_correction'],
  ['unfounded recurrence',ds=>[{...ds[0],corrections:{recurringPattern:'weekly_monday',correctionReason:'Guess'}},ds[1]],'unsupported_recurrence_correction'],
])test('rejects '+label,()=>{
  const sources=[item(1),item(2)];assert.throws(()=>parseCompactStage4Response(text(mutate(sources.map(i=>decision(i)))),sources),new RegExp(code));
});

test('shifted semantic identities retry and hold instead of accepting complete but misbound IDs',async()=>{
  const sources=[item(1),item(2)];
  const result=await run(sources,()=>({text:text(sources.map((s,i)=>decision(s,{sourceIdentity:decision(sources[1-i]).sourceIdentity})))}));
  assert.equal(requests.length,2);assert.equal(result.length,0);
  assert.equal(getCompactStage4Hold(result).reason,'source_identity_mismatch');
});

test('supported holiday and weekly recurrence corrections keep source fields intact',async()=>{
  const sources=[item(1,{name:'Thanksgiving Dinner',date:'2026-10-12',recurringPattern:'daily'}),
    item(2,{name:'Music Trivia Thursdays',recurringPattern:'none'})];
  const result=await run(sources,()=>({text:text(sources.map(i=>decision(i,{corrections:{recurringPattern:i._pipelineIndex===1?'none':'weekly_thursday',correctionReason:'Printed source wording supports correction.'}})))}));
  assert.deepEqual(result.map(i=>i.recurringPattern),['none','weekly_thursday']);
  for(const [index,r] of result.entries())for(const k of Object.keys(sources[index]).filter(k=>k!=='recurringPattern'))assert.deepEqual(r[k],sources[index][k]);
  assert.equal(sources[0].recurringPattern,'daily');
});

test('negative and conditional schedule mentions cannot manufacture recurrence',()=>{
  for(const description of ['Not every Thursday.', 'No longer weekly on Thursday.', 'If this becomes weekly on Thursday.', 'Previously every Thursday.']){
    const source=item(1,{description});
    assert.throws(()=>parseCompactStage4Response(text([decision(source,{corrections:{recurringPattern:'weekly_thursday',correctionReason:'Guess'}})]),[source]),/unsupported_recurrence_correction/);
  }
  const source=item(1,{recurringPattern:undefined});
  assert.doesNotThrow(()=>parseCompactStage4Response(text([decision(source,{corrections:{recurringPattern:'none',correctionReason:'No recurrence'}})]),[source]));
  const annual=item(1,{name:'33rd Annual Pumpkin Weigh-Off',recurringPattern:'daily'});
  assert.doesNotThrow(()=>parseCompactStage4Response(text([decision(annual,{corrections:{recurringPattern:'none',correctionReason:'Annual dated event, not daily'}})]),[annual]));
  const may=item(1,{description:'Every Thursday in May.'});
  assert.doesNotThrow(()=>parseCompactStage4Response(text([decision(may,{corrections:{recurringPattern:'weekly_thursday',correctionReason:'Explicit weekday'}})]),[may]));
});

test('all frozen October 11 request bodies restore exactly and compact retains all evidence and rules',()=>{
  const root='artifacts/stage4-compact-oct11/contract-offline';
  const results=fs.readFileSync(root+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
  const old=fs.readFileSync('artifacts/luna-stage4-cache-layout-oct11/full-offline/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
  let restored=0,preserved=0;
  for(const result of results.filter(r=>r.arm==='baseline')){
    const compact=results.find(r=>r.caseId===result.caseId&&r.arm==='compact');
    for(const request of result.requests){
      const capture=JSON.parse(fs.readFileSync(`${root}/${result.caseId}-baseline-${request.number}.json`)).request;
      if(result.caseId.startsWith('oct11-')){
        const prior=old.find(r=>r.row===result.row&&r.arm==='baseline');
        assert(prior.requests.some(q=>{try{assert.deepEqual(capture,q.original);return true;}catch{return false;}}),result.caseId+': original body drift');
        restored++;
      }
      const matching=compact.requests.find(q=>JSON.stringify(q.sourceIndices)===JSON.stringify(request.sourceIndices));assert(matching);
      const candidate=JSON.parse(fs.readFileSync(`${root}/${result.caseId}-compact-${matching.number}.json`)).request;
      const before=capture.input[0].content[0].text,after=candidate.input[0].content[0].text;
      assert.equal(before.split('CRITICAL JSON FORMATTING REQUIREMENTS:')[0],after.split('COMPACT JSON RESPONSE REQUIREMENTS:')[0]);
      for(const key of Object.keys(capture).filter(k=>k!=='input'))assert.deepEqual(candidate[key],capture[key]);
      assert.equal(candidate.text.format.strict,true);preserved++;
    }
  }
  assert.equal(restored,56);assert.equal(preserved,142);
});

test('structured rejection is not reversed by the words valid event in its reason',async()=>{
  const sources=[item(1,{date:'',startTime:'unknown'})];
  const result=await run(sources,()=>({text:text([decision(sources[0],{decision:'REJECTED',reason:'Missing date and time; this is not a valid event.'})])}));
  assert.equal(result.length,0);assert.equal(getCompactStage4Hold(result),undefined);assert.equal(requests.length,1);
});

test('one malformed response retries once and recovers from the original sources',async()=>{
  const sources=[item(1)];const result=await run(sources,(_body,n)=>({text:n===1?'{broken':text(sources.map(i=>decision(i)))}));
  assert.equal(requests.length,2);assert.equal(result.length,1);assert.equal(result[0].ticketLink,sources[0].ticketLink);
});

for(const [name,handler,reason] of [
  ['malformed JSON',()=>({text:'{broken'}),'malformed_json'],
  ['incomplete API response',body=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},text:text(inputItems(body).map(i=>decision(i)))}),'response_incomplete'],
  ['HTTP rate limit',()=>new Response(JSON.stringify({error:{message:'offline rate limit',type:'rate_limit_error'}}),{status:429,headers:{'content-type':'application/json'}}),'api_error'],
])test(name+' holds after exactly two calls without raw passthrough',async()=>{
  const result=await run([item(1)],handler);assert.equal(requests.length,2);assert.equal(result.length,0);
  assert.deepEqual(getCompactStage4Hold(result),{format:'compact_v1',reason,attempts:2});
});

test('a failed batch holds the entire post; successful sibling items cannot escape',async()=>{
  const sources=Array.from({length:17},(_,n)=>item(n+1));
  const result=await run(sources,body=>({text:inputItems(body).some(i=>i._pipelineIndex===17)?'{bad':text(inputItems(body).map(i=>decision(i)))}));
  assert.equal(result.length,0);assert.match(getCompactStage4Hold(result).reason,/chunk_2:malformed_json/);
  assert.equal(requests.length,3);
  assert.deepEqual(requests.map(b=>inputItems(b).map(i=>i._pipelineIndex)).sort((a,b)=>a[0]-b[0]),
    [Array.from({length:15},(_,n)=>n+1),[16,17],[16,17]]);
});

test('turning the switch off restores the original request body exactly',async()=>{
  const source=JSON.parse(fs.readFileSync('artifacts/luna-stage4-cache-layout-oct11/full-offline/cohort.json'))[1];
  const old=fs.readFileSync('artifacts/luna-stage4-cache-layout-oct11/full-offline/results.jsonl','utf8').trim().split('\n').map(JSON.parse)
    .find(x=>x.row===source.row&&x.arm==='baseline').requests[0].original;
  requests=[];respond=()=>({text:JSON.stringify({validatedItems:source.items.map(i=>({item:i,decision:'KEPT',reason:'Valid event',corrections:{}}))})});
  await performSecondaryValidation(source.items,source.venue,source.timestamp,{...config,stage4CompactValidation:false});
  assert.deepEqual(requests[0],old);assert.equal(requests[0].text,undefined);assert.equal(requests[0].prompt_cache_key,undefined);
});

test('replay consumer records a hold and never reaches Stage 5 or alternate model',async()=>{
  const {replayPostDataFromArtifacts}=await import('../lib/parsing/postParser.js');
  requests=[];respond=()=>({text:'{bad'});const artifacts=[],skips=[];
  const result=await replayPostDataFromArtifacts({combinedText:'Concert',mediaUrls:[],sharedPostThumbnails:[],userName:'Test venue',
    pageName:'Test venue',timestamp:'2026-10-10T12:00:00Z',facebookUrl:'https://facebook.com/test',profilePicUrl:'',extractedData:{id:'offline-hold-test'}},
    {},{stage3Items:[item(1)],contentType:'EVENT'},{...config,stageArtifactsHandler:a=>artifacts.push(a),skipReasonHandler:s=>skips.push(s)});
  assert.equal(result.length,0);assert.equal(requests.length,2);assert(requests.every(r=>r.model==='gpt-5-nano'));
  assert(artifacts.some(a=>a.stage4ValidationHold?.reason==='malformed_json'));
  assert(skips.some(s=>s.stage==='stage4'&&s.reason.includes('Compact validation held')));
});
