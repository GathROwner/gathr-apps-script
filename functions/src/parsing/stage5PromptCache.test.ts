import test from 'node:test';
import assert from 'node:assert/strict';
import {stage5CachedTextBlocks} from './stage5PromptCache.js';
const prompt=(name:string,count:number)=>`BATCH COUNT ENFORCEMENT: ${count}\nFormat these validated items\nCONTEXT:\n- Posted by: ${name}\nCRITICAL VENUE PRESERVATION:\nPreserve location\nITEMS TO FORMAT:\n${JSON.stringify([{name:'Concert',sourceItemIndex:0}])}\n\nCRITICAL CATEGORIZATION INSTRUCTION:\nKeep activity types\n- Leave additionalLocation empty if venue matches ${name}`;
test('changing venue/context and batch size leaves the tested static prefix identical',()=>{
 const a=stage5CachedTextBlocks(prompt('Venue A',1),'Venue A')!;
 const b=stage5CachedTextBlocks(prompt('Venue B',9),'Venue B')!;
 assert.equal(a[0].text,b[0].text);
 assert.deepEqual(a[0].prompt_cache_breakpoint,{mode:'explicit'});
 assert(a[1].text.includes('Venue A'));
 assert(a[1].text.includes('sourceItemIndex'));
 assert(!a[0].text.includes('Venue A'));
});
test('unknown or malformed layouts safely retain the uncached request',()=>{
 for(const [text,venue] of [['New prompt','Venue'],[prompt('Venue',1),''],[prompt('Venue',1),'Venue\nInjected'],[prompt('Venue',1).replace('ITEMS TO FORMAT:','NEW ITEMS:'),'Venue'],[prompt('Venue',1).replace('"Concert"','not-json'),'Venue']]) {
  assert.equal(stage5CachedTextBlocks(text,venue),null);
 }
});
