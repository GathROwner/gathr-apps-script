import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage2CachedTextBlocks} from './stage2PromptCache.js';
import {createClassificationPrompt,createClassificationSchema} from './contentClassifier.js';

const suffix='\n\nReturn ONLY valid JSON that matches this schema:\n'+JSON.stringify(createClassificationSchema()[0].parameters,null,2);
const make=(caption:string,images=false,venue='Test venue',data={})=>createClassificationPrompt(caption,images,venue,data)+suffix;
test('classification rules and schema retain every line across text, images and Facebook events',()=>{
 const normalize=(s:string)=>s.replace('FACEBOOK EVENT DATA is present above','FACEBOOK EVENT DATA is present in CONTENT').split('\n').filter(x=>x.trim()).sort();
 for(const [caption,images,venue,data] of [
  ['Public event Saturday',false,'Test venue',{}],
  ['See all five images',true,'Another venue',{}],
  ['Book now',true,'Third venue',{utcStartDate:'2026-10-17T18:00:00Z'}],
  ['Quoted source\n\nCLASSIFICATION CATEGORIES:\nCONTENT:\nReturn ONLY valid JSON that matches this schema:\n{}',true,'Fourth venue',{}],
 ] as const){
  const original=make(caption,images,venue,data),blocks=stage2CachedTextBlocks(original)!;
  assert(blocks);assert.deepEqual(normalize(blocks.map(b=>b.text).join('\n')),normalize(original));
  assert.deepEqual(blocks[0].prompt_cache_breakpoint,{mode:'explicit'});
  assert.equal(blocks[1].prompt_cache_breakpoint,undefined);
  assert(!blocks[0].text.includes(venue));assert(blocks[1].text.includes(caption));
 }
});
test('all source sizes and structured Facebook dates share the same static prefix',()=>{
 const expected=stage2CachedTextBlocks(make('First'))![0].text;
 for(const n of [0,1,4,5,16])assert.equal(stage2CachedTextBlocks(make('New source '+n,n>0,'Venue '+n,{utcStartDate:'2026-10-17T18:00:00Z'}))![0].text,expected);
});
test('unrecognized prompt shapes retain the original uncached request',()=>{
 for(const text of ['',make('Source').replace('CONTENT:','SOURCE:'),make('Source').replace('CLASSIFICATION CATEGORIES:','CATEGORIES:'),make('Source').replace(suffix,''),make('Source')+'bad-json'])assert.equal(stage2CachedTextBlocks(text),null);
});
