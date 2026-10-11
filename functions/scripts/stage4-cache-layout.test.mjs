import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage4CacheLayout} from './stage4-cache-layout.mjs';
const dir='artifacts/luna-stage4-cache-layout-oct11/full-offline';
const cohort=JSON.parse(fs.readFileSync(dir+'/cohort.json','utf8'));
const results=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.arm==='candidate');
test('All frozen Stage 4 sources retain instructions, final JSON contract, source items and request settings',()=>{
  assert.equal(cohort.length,53);assert.equal(cohort.reduce((n,c)=>n+c.items.length,0),171);
  let calls=0;const prefixes=new Set();
  for(const result of results)for(const r of result.requests){
    calls++;const change=stage4CacheLayout(r.original),content=change.body.input[0].content;
    assert(content[0].text.includes('VALIDATION RULES:'));
    assert(!content[0].text.includes('CURRENT CONTEXT:'));
    assert(content[1].text.startsWith('CURRENT CONTEXT:'));
    assert(content[2].text.startsWith('CRITICAL JSON FORMATTING REQUIREMENTS:'));
    assert(content[2].text.endsWith('Return pure JSON with validation results.'));
    const bag=s=>s.split('\n').filter(x=>x.trim()).sort();
    assert.deepEqual(bag(content.map(x=>x.text).join('\n')),bag(r.original.input[0].content[0].text));
    assert.equal(change.body.reasoning.effort,'low');assert.equal(change.body.model,'gpt-5-nano');
    assert.equal(change.body.max_output_tokens,r.original.max_output_tokens);
    assert(!('prompt_cache_options' in change.body));prefixes.add(change.prefix);
  }
  assert.equal(calls,56);assert.equal(prefixes.size,1);
});
test('Unknown or changed model, effort and prompt layouts fail closed',()=>{
  const r=results[0].requests[0].original;
  assert.throws(()=>stage4CacheLayout({...r,model:'gpt-6-luna'}));
  assert.throws(()=>stage4CacheLayout({...r,reasoning:{effort:'minimal'}}));
  const bad=structuredClone(r);bad.input[0].content[0].text='Unknown prompt';assert.throws(()=>stage4CacheLayout(bad));
});
