// Exercise real orchestration up to Stage 3 with deterministic Stage 1/2
// boundaries. This checks gallery order/config propagation, not model quality.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
globalThis.fetch=async()=>{throw Error('No network allowed in gallery flow test');};
Object.assign(process.env,{DRY_RUN:'true',PARSER_DRY_RUN_LOCAL_IMAGES:'true',LUNA_CANARY_ENABLED:'true',
  LUNA_CANARY_STAGE3_ONLY:'true',LUNA_TEXT_ONLY_ENABLED:'true',LUNA_CANARY_SAMPLE_PERCENT:'100',
  LUNA_CANARY_POST_IDS:'',LUNA_CANARY_EXCLUDED_POST_IDS:'',LUNA_CANARY_LEGACY_FALLBACK_ENABLED:'false',
  LUNA_STAGE1_PILOT_ENABLED:'true',LUNA_STAGE1_PILOT_SAMPLE_PERCENT:'100'});
delete process.env.IMAGE_UPLOAD_URL;delete process.env.IMAGE_DELETE_URL;
let classifications=[],calls=[],validations=[],extractions=[];
require('../lib/parsing/contentValidator.js').validateContent=async(_caption,images)=>{
  validations.push([...images]);
  return {hasValidContent:true,confidence:.95,validationDecision:'VALIDATION_PASSED',reason:'Frozen accepted source',
    imageAnalysis:images.map((_,imageIndex)=>({imageIndex,description:'Event poster',complexity:{hasCalendarGrid:false,hasDenseText:false}}))};
};
require('../lib/parsing/contentClassifier.js').classifyContent=async(_caption,images,_venue,_meta,config)=>{
  calls.push({images:[...images],model:config.stage2ModelOverride,recheck:config.stage2LunaNegativeRecheck});
  return structuredClone(classifications.shift());
};
require('../lib/parsing/eventExtractor.js').extractContentByType=async(...args)=>{
  extractions.push(args);throw Error('Audit stops before extraction');
};
const {parsePostData}=require('../lib/parsing/postParser.js');
const positive={contentType:'EVENT',confidence:.95,estimatedItemCount:1,classificationReason:'One source activity',
  contentAnalysis:{hasEvents:true,hasFoodSpecials:false,hasMultipleItems:false,organizationStyle:'unstructured'}};
const negative={...positive,confidence:0,contentAnalysis:{...positive.contentAnalysis,hasEvents:false}};
const images=Array.from({length:5},(_,i)=>'data:image/png;base64,'+Buffer.from('gallery-'+i).toString('base64'));
async function run(results,model='gpt-6-luna'){
  classifications=results;calls=[];validations=[];extractions=[];const stages={};let selections=0;
  await parsePostData({combinedText:'Concert October 17 at 8pm',mediaUrls:images,sharedPostThumbnails:[],
    userName:'Test',pageName:'Test',timestamp:'2026-10-09T12:00:00Z',facebookUrl:'',profilePicUrl:'',extractedData:{id:'stage2-gallery-flow'}},{},
    {stage2ModelOverride:model||undefined,stage2LunaNegativeRecheck:model==='gpt-6-luna',diagnosticContext:{fileId:'gallery-audit'},lunaStage3EligibleSelector:()=>{selections++;return true;},
      stageArtifactsHandler:s=>Object.assign(stages,s)});
  return {stages,selections};
}
test('candidate sees ordered four-image entry then all five with the same config',async()=>{
  await run([positive,positive]);
  assert.deepEqual(calls.map(c=>c.images),[images.slice(0,4),images]);
  assert.deepEqual(validations,[images.slice(0,4),images]);
  assert.ok(calls.every(c=>c.model==='gpt-6-luna'&&c.recheck===true));
  assert.equal(extractions.length,1);
});
test('Mini control receives the same gallery sequence',async()=>{
  await run([positive,positive],'gpt-5-mini');
  assert.deepEqual(calls.map(c=>c.images),[images.slice(0,4),images]);
  assert.ok(calls.every(c=>c.model==='gpt-5-mini'&&!c.recheck));
});
test('initial hold stops before gallery promotion or Stage 3',async()=>{
  const r=await run([negative]);
  assert.equal(calls.length,1);assert.equal(r.selections,0);assert.equal(extractions.length,0);
});
test('negative full-gallery refresh retains an already accepted classification',async()=>{
  await run([positive,{...negative,contentType:'FOOD_SPECIAL'}]);
  assert.equal(calls.length,2);assert.equal(extractions.length,1);
  assert.equal(extractions[0][0],'EVENT');
});
test('enabled pilot selects Luna once and keeps that model through gallery refresh',async()=>{
  process.env.LUNA_STAGE2_PILOT_ENABLED='true';process.env.LUNA_STAGE2_PILOT_SAMPLE_PERCENT='100';
  try {
    const r=await run([positive,positive],null);
    assert.ok(calls.every(c=>c.model==='gpt-6-luna'&&c.recheck));
    assert.equal(r.stages.stage2Pilot.selected,true);
  } finally {delete process.env.LUNA_STAGE2_PILOT_ENABLED;delete process.env.LUNA_STAGE2_PILOT_SAMPLE_PERCENT;}
});
