// Private operations: capture the human-selected clips and exact current source-linked listings.
const fs=require('node:fs/promises');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/selected-publication';
const eq=(fieldPath,value)=>({fieldFilter:{field:{fieldPath},op:'EQUAL',value:{stringValue:value}}});
(async()=>{
 await auth.signIn();await fs.mkdir(root,{recursive:true});
 const all=await auth.query('private_video_candidates',null);
 const selected=all.filter(d=>{const j=auth.data(d).humanJudgment;return j?.choice==='use'||j?.judgment==='want_video';});
 const rows=[];
 for(const d of selected){const c=auth.data(d),found=new Map(),queryErrors=[];
  const queries=[{fieldFilter:{field:{fieldPath:'sourceUniqueIds'},op:'ARRAY_CONTAINS',value:{stringValue:c.sourcePostId}}},eq('uniqueId',c.sourcePostId),eq('sourceUniqueId',c.sourcePostId),eq('metadata.uniqueId',c.sourcePostId)];
  for(const where of queries){try{for(const item of await auth.query('events',null,{group:true,where,limit:100}))found.set(item.name,item);}catch(e){queryErrors.push({field:where.fieldFilter.field.fieldPath,error:e.message});}}
  for(const l of c.listings||[])if(l.path){const v=await auth.get(l.path);if(v)found.set(v.name,v);}
  rows.push({candidate:d,events:[...found.values()],queryErrors});
 }
 const assets=await auth.query('listing_video_assets',null),links=await auth.query('listing_video_links',null);
 const result={atUTC:new Date().toISOString(),selected:rows,assets,links,idle:await auth.idle()};
 await fs.writeFile(root+'/CAPTURE.json',JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({selected:rows.length,assets:assets.length,idle:result.idle.activeLocks,rows:rows.map(r=>{const c=auth.data(r.candidate);return{id:r.candidate.name.split('/').at(-1),sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,caption:c.caption.slice(0,120),state:c.state,content:c.contentAssessment?.decision,seconds:c.durationSeconds,sha:c.sha256,audio:c.sourceAudio,judgment:c.humanJudgment.judgment,events:r.events.map(d=>{const e=auth.data(d);return{path:d.name.split('/documents/')[1],title:e.name||e.eventName,date:e.startDate,endDate:e.endDate,time:e.startTime,expired:e.isExpired};})};})},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
