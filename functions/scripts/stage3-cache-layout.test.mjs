import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage3CacheLayout} from './stage3-cache-layout.mjs';
const dir='artifacts/luna-stage3-cache-layout-oct11/full-offline';
const cohort=JSON.parse(fs.readFileSync(dir+'/cohort.json','utf8'));
const results=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.arm==='candidate');
test('Full available cohort preserves instruction multiplicity, field blocks and all request settings',()=>{
  assert.equal(cohort.length,52);assert.equal(results.length,52);
  let applied=0,auxiliary=0;
  for(const result of results){
    const source=cohort.find(c=>c.row===result.row);
    for(const c of result.calls){
      const change=stage3CacheLayout(c.original,source);
      if(!change.applied){assert.deepEqual(change.body,c.original);auxiliary++;continue;}
      applied++;
      const before=c.original.input[0].content,after=change.body.input[0].content;
      assert.deepEqual(after.slice(2),before.slice(1));
      const bag=t=>t.split('\n').filter(x=>x.trim()).sort();
      assert.deepEqual(bag(after.slice(0,2).map(x=>x.text).join('\n')),bag(before[0].text));
      const {input:oldInput,...oldParameters}=c.original;
      const {input:newInput,prompt_cache_options,...newParameters}=change.body;
      assert.deepEqual(newParameters,oldParameters);
      assert.deepEqual(prompt_cache_options,{mode:'explicit',ttl:'30m'});
      if(change.fieldsChars){
        const suffix=after[1].text,fieldsAt=suffix.indexOf('found, extract:');
        assert(fieldsAt>=0);
        assert(suffix.indexOf('- venue:',fieldsAt)>fieldsAt,'Venue instruction stays inside complete field list');
        assert(suffix.indexOf('CONTENT:\n')>fieldsAt,'Field list precedes source caption');
      }
    }
  }
  assert(applied>=50);assert(auxiliary>=1);
});
test('Souris calendar retains the entire venue and spatial field contract',()=>{
  const r=results.find(r=>r.row===292),c=r.calls.find(c=>c.layout.applied);
  const source=cohort.find(s=>s.row===292),change=stage3CacheLayout(c.original,source);
  const suffix=change.body.input[0].content[1].text;
  assert(suffix.includes('- venue: Venue name if different from Souris Show Hall'));
  assert(suffix.includes('- spatial: Preserve explicit structure'));
  assert(suffix.includes('- relevantImageIndex: 0-based index'));
  assert(change.body.input[0].content[0].text.includes('Different')||change.body.input[0].content[0].text.includes('different'));
});
test('Unavailable original galleries remain excluded from the paid cohort',()=>{
  const excluded=JSON.parse(fs.readFileSync(dir+'/excluded.json','utf8'));
  assert.deepEqual(excluded.map(r=>r.row),[81,82]);
  assert(!cohort.some(r=>[81,82].includes(r.row)));
});
