// Current automatic matcher, saved source responses and fresh canonical records.
// The proposed edition is local only; no review, publication or DB writes.
import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {resolveFestivalMembership}=require('../functions/lib/services/festivalLinker.js');
const dir='functions/artifacts/pumpkin-overview-oct16';
const trial=JSON.parse(await fs.readFile('functions/artifacts/festival-context-oct15/fresh-pumpkin-context-final/1539985468169427.json','utf8'));
if(process.argv.includes('--revalidate')){const {validateFestivalEvidenceCapture}=await import('../functions/scripts/festival-evidence-extractor.mjs');trial.result=validateFestivalEvidenceCapture(trial.result,trial.capture);}
const live=JSON.parse(await fs.readFile(dir+'/live-readonly.json','utf8'));
const catalogue=JSON.parse(await fs.readFile('functions/artifacts/festival-week-oct15/canonical.json','utf8'));
const venues=catalogue.venues.map(v=>({id:v.id,label:v.data.name,aliases:v.data.aliases||[],latitude:Number(v.data.latitude),longitude:Number(v.data.longitude)}));
const candidates=live.documents.filter(d=>d.path.includes('/events/')).map(d=>({path:d.path,data:d.data}));
const edition={id:'local_pumpkin_2026',name:'Summerside Pumpkin Festival',year:2026,startDate:'2026-10-15',endDate:'2026-10-31',organizerId:'local_proposed_publisher',organizerNames:['La Belle-Alliance'],sourceIds:[trial.capture.id],venueIds:live.documents.filter(d=>d.path.startsWith('venues/')&&!d.path.includes('/events/')).map(d=>d.path.split('/')[1])};
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const sources=trial.result.activities.filter(a=>a.verification?.accepted===true).map((a,i)=>{
 const matches=venues.filter(v=>[v.label,...v.aliases].some(n=>norm(n.replace(/^the /i,''))===norm(a.venueText.replace(/^the /i,''))));
 return {id:'saved_'+i,source:{id:trial.capture.id,url:trial.capture.sourceUrl,text:trial.result.sourceText,documents:trial.result.documents,publisherId:'original_publisher',organizerId:edition.organizerId},kind:a.kind,scopeText:a.scopeText,membershipText:a.membershipText,festivalNameText:a.festivalNameText,yearText:a.yearText,organizerText:a.organizerText,...(a.sourceScope?{sourceScope:a.sourceScope}:{}),...(a.activityRowText?{activityRowText:a.activityRowText,dateHeaderText:a.dateHeaderText}:{}),activity:{name:a.name,venueId:matches.length===1?matches[0].id:'',startDate:a.startDate,startTime:a.startTime},eventText:a.eventText,dateText:a.dateText,timeText:a.timeText,venueText:a.venueText};
});
const input={umbrella:edition,sources,candidates,venues};const result=await resolveFestivalMembership(input);
const reverse=await resolveFestivalMembership({...input,sources:[...sources].reverse(),candidates:[...candidates].reverse()});assert.deepEqual(reverse,result,'Order-dependent linking');
const reasons={};for(const o of result.outcomes)reasons[o.reason]=(reasons[o.reason]||0)+1;
const report={checkedAt:new Date().toISOString(),mode:'local_proposed_edition_only',publicationApproved:false,savedEntries:trial.result.activities.length,independentlyAccepted:sources.length,canonicalRecords:candidates.length,reasons,links:result.links.length,orderReplayIdentical:true,paidCalls:0,liveWrites:0,result};
await fs.writeFile(dir+(process.argv.includes('--revalidate')?'/automatic-matcher-after.json':'/automatic-matcher-before.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,result:undefined}));
