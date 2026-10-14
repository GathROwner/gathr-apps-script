import test from 'node:test';import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct14-integrity.json';
import {applyCategoryCorrectionsForRegression,preserveValidatedOccurrence,formatStage5BatchesWithRecovery} from './finalFormatter.js';
import {applyPrintedSpecialClosingLimit} from './postParser.js';
const row=(n:number):any=>fixture.rows.find(x=>x.row===n)!;
const formatted=(item:any,category:string):any=>({name:item.name,description:item.description,establishment:item.venue,
  venue:item.venue,category,isEvent:'Yes',isFoodSpecial:'No',startDate:item.date,endDate:item.date,
  startTime:item.startTime,endTime:item.endTime||'21:00',recurringPattern:'none'});
test('all four Harmony jazz shows and PEERS support retain activity identities despite incidental food',()=>{
  for(const r of [row(274),row(325)])for(const item of r.items){
    const expected=r.row===274?'Live Music':'Gatherings & Parties';
    const out=applyCategoryCorrectionsForRegression(formatted(item,expected),item);
    assert.equal(out.category,expected);assert.equal(out.isEvent,'Yes');assert.equal(out.isFoodSpecial,'No');
  }
});
test('genuine advertised specials remain specials; a concert dinner is not duplicated',()=>{
  for(const r of [row(133),row(185),row(187)])for(const item of r.items.filter((x:any)=>x._sourceType==='special')){
    const out=applyCategoryCorrectionsForRegression(formatted(item,'Food Special'),item);
    assert.equal(out.isFoodSpecial,'Yes');
  }
  const item:any={name:'Jonny and Louise Dinner and Music',description:'Dinner and live music included in one $40 ticket.',_sourceType:'event'};
  assert.equal(applyCategoryCorrectionsForRegression(formatted(item,'Live Music'),item).category,'Live Music');
});
test('anniversary concert tour is not cinema merely because the venue is a theatre',()=>{
  const item=row(135).items.find((x:any)=>/McKennitt/.test(x.name));
  assert.equal(applyCategoryCorrectionsForRegression(formatted(item,'Cinema'),item).category,'Live Music');
  const screening={name:'Anniversary film screening tour',description:'Documentary screening',venue:'The Tivoli Cinema'};
  assert.equal(applyCategoryCorrectionsForRegression(formatted(screening,'Cinema'),screening as any).category,'Cinema');
});
test('validated weekly source flag cannot restore recurrence to a dated Island Jazz guest',()=>{
  const r=row(23),item=r.items[0];
  const out=preserveValidatedOccurrence({...formatted(item,'Live Music'),establishment:"Baba's Lounge",startDate:'2026-10-15',endDate:'2026-10-15'},item);
  assert.equal(out.recurringPattern,'none');assert.equal(out.isRecurring,'No');
  const generic={...item,name:'Island Jazz',description:'Island Jazz at Baba\'s Lounge every Thursday night all year round.',extractionReason:'Weekly jazz series'};
  assert.equal(preserveValidatedOccurrence({...formatted(generic,'Live Music'),establishment:"Baba's Lounge"},generic).recurringPattern,'weekly_thursday');
});
test('today specials respect printed closing time, preserving explicit service clocks and future days',()=>{
  for(const [n,end]of [[133,'19:00'],[185,'20:00'],[187,'20:00']] as const){
    const r=row(n),e:any={name:'Food offer',category:'Food Special',isFoodSpecial:'Yes',startDate:n===185?'2026-10-14':'2026-10-13',startTime:'11:30',endTime:'21:00',timeFlags:{end:{source:'none'}}};
    applyPrintedSpecialClosingLimit(e,r.caption,e.startDate);assert.equal(e.endTime,end);
  }
  for(const e of [{startDate:'2026-10-15',timeFlags:{end:{source:'none'}}},{startDate:'2026-10-14',timeFlags:{end:{source:'explicit'}}}]){
    const event:any={name:'Offer',isFoodSpecial:'Yes',startTime:'11:00',endTime:'22:00',...e};
    applyPrintedSpecialClosingLimit(event,'Open till 8pm','2026-10-14');assert.equal(event.endTime,'22:00');
  }
});
test('one-item malformed Stage 5 response gets one bounded retry',async()=>{
  let count=0;const item:any={name:'Raine and Chantal',date:'2026-11-04',startTime:'20:00',venue:'Sobey',_sourceType:'schedule'};
  const out=await formatStage5BatchesWithRecovery([item],9,async()=>({formattedEvents:++count===1?[]:[{sourceItemIndex:0,name:item.name,startDate:item.date,startTime:item.startTime,venue:item.venue} as any],formattingDecisions:[]}));
  assert.equal(count,2);assert.equal(out?.length,1);
});
test('API prompt rejection is terminal and never publishes earlier successful batches',async()=>{
  let count=0;const items:any[]=Array.from({length:21},(_,i)=>({name:'Activity '+i,date:'2026-10-15',startTime:'18:00',_sourceType:'schedule'}));
  await assert.rejects(formatStage5BatchesWithRecovery(items,9,async(batch,offset)=>{
    count++;if(offset===18)throw Object.assign(new Error('Prompt rejected'),{status:400,code:'invalid_prompt'});
    return {formattedEvents:batch.map((item,sourceItemIndex)=>({name:item.name,startDate:item.date,startTime:item.startTime,sourceItemIndex} as any)),formattingDecisions:[]};
  },2),/Prompt rejected/);assert.equal(count,3);
});
