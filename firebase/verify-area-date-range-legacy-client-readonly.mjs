// Execute the accepted older app's real timing functions against the proposed
// public contract. No model calls, production writes, or emulator interactions.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const ts=require('typescript');
const appRepo='C:/Users/craig/.codex/worktrees/9513/GathR-upgrade-sdk54';
const source=execFileSync('git',['show','a43cb20:utils/eventTiming.ts'],{cwd:appRepo,encoding:'utf8',maxBuffer:2e6});
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports,console,Intl,Date,require:name=>{throw new Error('Unexpected older timing dependency '+name);}}, {filename:'accepted-a43cb20-eventTiming.js'});
const spec=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const timing=spec.eventPatch.timing;
assert(timing?.version===2,'New preview must contain compatibility timing');
assert.equal(timing.scheduleKind,'multi_day');
assert.equal(timing.schedule.start.status,'unknown');assert.equal(timing.schedule.end.status,'unknown');
assert(!timing.schedule.start.localTime&&!timing.schedule.end.localTime);
assert(!timing.estimate?.displayEndTime&&!timing.estimate?.displayEndAt);
const event={locationScope:'area',startDate:'2026-10-14',endDate:'2026-10-18',startTime:'',endTime:'',timing};
const cases=[['2026-10-13T18:00:00Z',true,false],['2026-10-14T23:00:00Z',true,true],['2026-10-15T14:00:00Z',true,true],['2026-10-19T02:59:00Z',true,true],['2026-10-19T03:00:00Z',false,false]];
const results=cases.map(([at,visible,today])=>{
 const now=new Date(at),state=module.exports.getEventScheduleState(event,now);
 assert.equal(state.defaultMapEligible,visible,at);assert.equal(state.todayEligible,today,at);assert.equal(state.nowEligibility,'none',at);
 const range=module.exports.getEventTimeRangeParts(event,now);const badge=module.exports.getEventTimingBadge(event,now);
 assert(!/23:59|11:59|7:00|19:00/.test(range.text),'Discovery boundary leaked as advertised hours');
 return {at,state:state.code,visible,today,nowEligibility:state.nowEligibility,visibleTimeText:range.text,badge:badge?.text||null};
});
const report={checkedAt:new Date().toISOString(),acceptedAppBaseline:'a43cb20',producerSpec:path.resolve(process.argv[2]),actualOlderTimingFunctionsExecuted:true,publicClockFieldsRemainUnknown:true,results};
const output=path.resolve(import.meta.dirname,'../functions/artifacts/anchor-festival-oct14/date-range-legacy-client-verified.json');
await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
