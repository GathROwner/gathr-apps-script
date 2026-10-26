import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {parseDetailPageCandidate} from './websiteDetailEnricher.js';
const fixtures=JSON.parse(fs.readFileSync('src/parsing/oct18SourceFixtures.json','utf8'));
test('saved Hunter caption preserves both finite weekend dates and explicit finishes',()=>{
 const f=fixtures['59'],items=constrainSourceTimes(f.items,f.caption);
 assert.deepEqual(items.map(i=>i.date).sort(),['2026-10-17','2026-10-18']);
 for(const i of items){assert.equal(i.startTime,'11:00');assert.equal(i.endTime,'15:00');assert.equal(i.timeFlags?.end?.source,'explicit');assert.equal((i as any).recurringPattern,'none');}
 assert.deepEqual(constrainSourceTimes(items,f.caption),items,'second pass is idempotent');
 assert.equal(constrainSourceTimes(f.items,f.caption.replace('Saturday and Sunday','Saturday')).length,1);
 assert.equal(constrainSourceTimes(f.items,'Every weekend. '+f.caption).length,1);
});
test('saved Montague source recovers breakfast without giving its clocks to Halloween Hustle',()=>{
 const f=fixtures['323'],items=constrainSourceTimes(f.items,f.caption);
 const meal=items.find(i=>i.name==='Pancake Breakfast');assert(meal);
 assert.equal(meal.date,'2026-10-31');assert.equal(meal.startTime,'09:30');assert.equal(meal.endTime,'11:00');
 assert.equal(meal._sourceType,'event');
 assert.equal(items.find(i=>/Hustle/.test(i.name))?.startTime,'');
 assert.deepEqual(constrainSourceTimes(items,f.caption),items);
 for(const caption of [f.caption.replace('Oct 31st','Oct 30th'),f.caption.replace('930-11am',''),f.caption+' Private booking.'])assert.equal(constrainSourceTimes(f.items,caption).length,1);
});
test('advertised dinner-theatre run holds without inventing performances',()=>{
 const f=fixtures['55'],items=constrainSourceTimes(f.items,f.caption);
 assert.equal(sourceItemHoldReason(items[0]),'performance_run_requires_individual_occurrence_dates');
 for(const caption of [f.caption.replace('November 28 – December 19','November 28'), 'Anchor Fest October 14–18, 2026.']){
  const input={...f.items[0],description:'',name:'Festival'};
  assert.equal(sourceItemHoldReason(constrainSourceTimes([input],caption)[0]),undefined);
 }
});
test('source activity categories survive incidental sports and venue priors',()=>{
 for(const row of ['96','240']){
  const f=fixtures[row],result=applyCategoryCorrectionsForRegression(f.final[0],f.items[0]);
  assert.equal(result.category,row==='96'?'Food Special':'Gatherings & Parties');
  assert.equal(result.isFoodSpecial,row==='96'?'Yes':'No');assert.equal(result.isEvent,row==='96'?'No':'Yes');
 }
 const meal=constrainSourceTimes(fixtures['323'].items,fixtures['323'].caption).find(i=>i.name==='Pancake Breakfast')!;
 assert.equal(applyCategoryCorrectionsForRegression({...fixtures['96'].final[0],name:meal.name,description:meal.description,category:'Food Special'},meal).category,'Gatherings & Parties');
});
test('Harvest page uses the overall printed range, not the food-vendor window',()=>{
 const result=parseDetailPageCandidate('https://fixture.example/harvest','<h1>Harvest Fest</h1><p>Saturday, October 17, 2026 | 3:00 to 8:00 pm</p><h2>Food and Drink</h2><p>16 vendors | 11:00 am to 8:00 pm</p>',2026);
 assert.equal(result?.startTime,'15:00');assert.equal(result?.endTime,'20:00');
});
