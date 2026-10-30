import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {performSecondaryValidation} from './secondaryValidator.js';
import {getItemValidationHolds} from './compactStage4.js';
import type {ExtractedItem,ParsingConfig} from './types.js';
import {DEFAULT_PARSING_CONFIG} from './types.js';

test('item recurrence holds survive actual validation, batching and all-held output without network',async()=>{
 const original=OpenAI.Responses.prototype.create,oldKey=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='offline-fixture-only';let calls=0;
 (OpenAI.Responses.prototype as any).create=async(request:any)=>{
  calls++;
  const properties=request.text.format.schema.properties.decisions.items.properties;
  const ids=properties.sourceItemIndex.enum as number[];
  const decisions=ids.map(id=>({sourceItemIndex:id,sourceIdentity:{name:`Craft ${id}`,date:'2026-11-05',startTime:'17:00',venue:'Library'},decision:'KEPT',reason:'Dated craft activity.',corrections:{recurringPattern:id%2?'daily':null,correctionReason:id%2?'Invented recurrence.':''}}));
  return {id:'offline-response',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({decisions})}]}],usage:{input_tokens:0,output_tokens:0,total_tokens:0}};
 };
 const source=(id:number)=>({name:`Craft ${id}`,date:'2026-11-05',startTime:'17:00',endTime:'',venue:'Library',description:'A single dated craft activity.',recurringPattern:'none',_pipelineIndex:id}) as ExtractedItem;
 const config={...DEFAULT_PARSING_CONFIG,stage4CompactValidation:true,stage4Model:'gpt-5-nano',model:'gpt-5-nano',stage4BatchSize:2} as ParsingConfig;
 try{
  const partial=await performSecondaryValidation([1,2,3,4].map(source),'Library','2026-10-28T12:00:00Z',config);
  assert.deepEqual(partial.map(x=>x.name),['Craft 2','Craft 4']);
  assert.deepEqual(getItemValidationHolds(partial).map(x=>x.name),['Craft 1','Craft 3']);
  const allHeld=await performSecondaryValidation([source(1)],'Library','2026-10-28T12:00:00Z',config);
  assert.equal(allHeld.length,0);assert.equal(getItemValidationHolds(allHeld).length,1);assert.equal(calls,3);
 }finally{OpenAI.Responses.prototype.create=original;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
