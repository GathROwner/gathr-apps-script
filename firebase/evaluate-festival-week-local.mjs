// Pure current matcher applied to unapproved local edition contexts. No network.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {resolveFestivalMembership}=require('../functions/lib/services/festivalLinker.js');
const root='functions/artifacts/festival-week-oct15';
const canonical=JSON.parse(await fs.readFile(root+'/canonical.json','utf8'));
const venues=canonical.venues.map(v=>({id:v.id,label:v.data.name,aliases:v.data.aliases||[],latitude:Number(v.data.latitude),longitude:Number(v.data.longitude)}));
const cases=[root+'/local_harvest_2026/capture.json',root+'/pumpkin-large-trial/1539985468169427.json'];
const reports=[];
for(const file of cases){
 const trial=JSON.parse(await fs.readFile(file,'utf8'));
 const identity=trial.edition||JSON.parse(await fs.readFile(root+'/pumpkin-local-edition.json','utf8'));
 const edition={...identity,organizerId:'local_unreviewed_organizer',organizerNames:[identity.name],sourceIds:[],venueIds:[]};
 const normalized=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const sources=trial.result.activities.filter(a=>a.verification?.accepted===true).map((a,index)=>{
  const matches=venues.filter(v=>[v.label,...v.aliases].some(n=>normalized(n.replace(/^the /i,''))===normalized(a.venueText.replace(/^the /i,''))));
  return {id:'local_'+index,source:{id:trial.capture.id,url:trial.capture.sourceUrl,text:trial.result.sourceText,documents:trial.result.documents,publisherId:'local_original_publisher'},kind:a.kind,scopeText:a.scopeText,membershipText:a.membershipText,festivalNameText:a.festivalNameText,yearText:a.yearText,organizerText:a.organizerText,activity:{name:a.name,venueId:matches.length===1?matches[0].id:'',startDate:a.startDate,startTime:a.startTime},eventText:a.eventText,dateText:a.dateText,timeText:a.timeText,venueText:a.venueText};
 });
 const input={umbrella:edition,sources,candidates:canonical.candidates,venues};
 const result=await resolveFestivalMembership(input),repeat=await resolveFestivalMembership({...input,sources:[...sources].reverse(),candidates:[...canonical.candidates].reverse()});assert.deepEqual(result,repeat,'Matcher changed on order replay');assert.equal(result.links.length,0,'Unreviewed test unexpectedly proposed links');
 reports.push({edition:edition.name,localUnreviewedContext:true,publicationEligible:false,captureComplete:trial.result.complete,capturedRows:trial.result.activities.length,modelConfirmed:trial.result.activities.filter(a=>a.modelVerification?.accepted).length,validatorAccepted:sources.length,validatorHeld:trial.result.activities.length-sources.length,result,orderReplayIdentical:true});
}
const payload={checkedAt:new Date().toISOString(),reports,liveWrites:0,paidCalls:0};await fs.writeFile(root+'/matcher-results.json',JSON.stringify(payload,null,2));console.log(JSON.stringify(payload,null,2));
