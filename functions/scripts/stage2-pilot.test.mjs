import assert from 'node:assert/strict';
import test from 'node:test';
import {selectStage2LunaPilot as select} from '../lib/parsing/stage2Pilot.js';
import {selectStage1LunaPilot} from '../lib/parsing/stage1Pilot.js';
test('Stage 2 is disabled without explicit pilot enablement',()=>{
  delete process.env.LUNA_STAGE2_PILOT_ENABLED;delete process.env.LUNA_STAGE2_PILOT_SAMPLE_PERCENT;
  assert.equal(select('dataset','source',true).selected,false);
});
test('allocation requires Stage 1-passed usable source inputs and stable identities',()=>{
  for(const [file,id,ready] of [['dataset','',true],['','source',true],['dataset','source',false]])
    assert.equal(select(file,id,ready,true,50).eligible,false);
  for(const percent of [NaN,-1,0,101]) assert.equal(select('dataset','source',true,true,percent).selected,false);
  assert.equal(select('dataset','source',true,true,100).selected,true);
});
test('50 percent allocation survives resume order and is independent of Stage 1',()=>{
  const ids=Array.from({length:1000},(_,i)=>'source-'+i);
  const choices=new Map(ids.map(id=>[id,select('dataset',id,true,true,50).selected]));
  for(const id of ids.reverse())assert.equal(select('dataset',id,true,true,50).selected,choices.get(id));
  const selected=[...choices.values()].filter(Boolean).length;
  assert.ok(selected>=450&&selected<=550);
  const different=ids.filter(id=>choices.get(id)!==selectStage1LunaPilot('dataset',id,1,true,50,true).selected).length;
  assert.ok(different>=400&&different<=600);
});
