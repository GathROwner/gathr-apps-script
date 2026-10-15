// Local saved-response playback. No network, credentials, public writes or paid API calls.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const args=process.argv.slice(2);assert.equal(args.length,2,'Usage: node scripts/oct15-hardening-playback.mjs <audit-artifact-dir> <out-file>');
const base=path.resolve(args[0]),out=path.resolve(args[1]);
const read=async name=>JSON.parse(await fs.readFile(path.join(base,name),'utf8'));
const ledger=await read('source-review/source-ledger.json');
const raw4=await read('row257-stage4-raw-retrieval.json'),raw5=await read('row277-stage5-raw-retrieval.json');
const text=response=>response.output_text || (response.output||[]).flatMap(x=>(x.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join('');
process.env.OPENAI_API_KEY='offline-no-paid-calls';process.env.STAGE5_RESPONSES_REASONING_EFFORT='none';
process.env.STAGE5_RESPONSES_MAX_OUTPUT_TOKENS='32000';delete process.env.IMAGE_UPLOAD_URL;delete process.env.IMAGE_DELETE_URL;
const calls=[];
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses','Playback cannot use the network');
  const request=JSON.parse(options.body);calls.push(request);
  if(calls.length===1)return new Response(JSON.stringify(raw5.response),{headers:{'content-type':'application/json'}});
  assert.equal(calls.length,2,'One bounded retry only');
  const source=ledger.find(x=>x.row===277).stage4[0];
  const event={sourceItemIndex:0,isEvent:'Yes',isFoodSpecial:'No',category:'Karaoke',name:source.name,description:source.description,
    establishment:'Be You Bar',address:'119 Grafton St, Charlottetown, PE',startDate:source.date,endDate:source.date,
    startTime:source.startTime,endTime:source.endTime,ticketPrice:'',ticketLink:'',relevantImageIndex:0,venue:source.venue,
    additionalLocation:'',isRecurring:'Yes',recurringPattern:source.recurringPattern};
  return new Response(JSON.stringify({id:'offline-success',status:'completed',output_text:JSON.stringify({formattedEvents:[event],formattingDecisions:[]}),
    usage:{input_tokens:1,output_tokens:1,total_tokens:2,output_tokens_details:{reasoning_tokens:0}}}),{headers:{'content-type':'application/json'}});
};
createRequire(import.meta.url)('openai/shims/web');
const {parseCompactStage4Response}=await import('../lib/parsing/compactStage4.js');
const {performFinalFormatting,rehydrateFormattedEventMetadata}=await import('../lib/parsing/finalFormatter.js');
const {constrainSourceTimes}=await import('../lib/parsing/sourceTimeConstraints.js');
const {enforceDateTimeCompleteness}=await import('../lib/parsing/postParser.js');
const tacos=ledger.find(x=>x.row===257).stage3;
for(const r of raw4.responses){const parsed=parseCompactStage4Response(text(r.response),tacos);assert.equal(parsed.validatedItems.length,2);assert(parsed.validatedItems.every(x=>x.item.recurringPattern==='weekly_thursday' && x.corrections.recurringPattern===null));}
const karaoke=await performFinalFormatting(ledger.find(x=>x.row===277).stage4,'Be You Bar','119 Grafton St','2026-10-14T22:00:00Z',
  {stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:1});
assert.equal(karaoke.length,1);assert.deepEqual(calls.map(x=>x.max_output_tokens),[32000,8000]);assert(calls.every(x=>x.reasoning.effort==='none'));
const dateOnly=[];
for(const row of [48,201,269,325]){
  const record=ledger.find(x=>x.row===row),sources=constrainSourceTimes(record.stage4,record.caption);
  const formatted=sources.map(item=>rehydrateFormattedEventMetadata({name:item.name,description:item.description,category:item._sourceType==='special'?'Food Special':'Gatherings & Parties',
    isEvent:item._sourceType==='special'?'No':'Yes',isFoodSpecial:item._sourceType==='special'?'Yes':'No',startDate:item.date,endDate:item.date,
    startTime:'',endTime:'',recurringPattern:'none'},item));
  const held=enforceDateTimeCompleteness(formatted,'2026-10-15T12:30:00Z','America/Halifax',record.caption);
  const enabled=enforceDateTimeCompleteness(formatted,'2026-10-15T12:30:00Z','America/Halifax',record.caption,false,true);
  assert.equal(held.length,0);assert.equal(enabled.length,sources.length);assert(enabled.every(x=>!x.startTime&&!x.endTime&&x.timing));
  dateOnly.push({row,sourceItems:sources.length,heldCandidates:held._dateOnlyCandidates.length,explicitOptInCandidates:enabled.length});
}
const summary={mode:'offline_saved_response_playback',newPaidCalls:0,networkCalls:0,publicWrites:0,
  tacoCapturedResponses:raw4.responses.length,tacoItemsPreserved:2,karaoke:{capturedFailureRejected:true,simulatedFreshSuccess:true,calls:2,limits:calls.map(x=>x.max_output_tokens),
  actualApiRecoveryQualityProven:false},dateOnly,productionDateOnlyEnabled:false};
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
