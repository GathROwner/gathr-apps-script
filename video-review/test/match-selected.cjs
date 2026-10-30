const fs=require('node:fs/promises');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/selected-publication';
(async()=>{
 await auth.signIn();
 const all=await auth.query('venues',['name','facebookUrl','cleanedFacebookUrl','address']);
 const venues=all.filter(d=>/bay fortune|holy cow|ruby|credit union place|blackbush/i.test(JSON.stringify(auth.data(d))));
 const capture=[];
 for(const d of venues){const path=d.name.split('/documents/')[1];
  const result=await auth.request(auth.database+'/documents/'+path+':runQuery','POST',{structuredQuery:{from:[{collectionId:'events'}]}});
  capture.push({venue:d,events:result.filter(x=>x.document).map(x=>x.document)});
 }
 await fs.writeFile(root+'/VENUE_EVENTS.json',JSON.stringify(capture,null,2),{flag:'wx'});
 console.log(JSON.stringify(capture.map(v=>({venue:v.venue.name.split('/').at(-1),name:auth.data(v.venue).name,events:v.events.map(d=>{const e=auth.data(d);return{path:d.name.split('/documents/')[1],name:e.name||e.eventName,date:e.startDate,end:e.endDate,time:e.startTime,source:e.sourceUniqueIds,uniqueId:e.uniqueId,description:e.description?.slice(0,650)};}).filter(e=>/harvest|950|friday|lasagna|18|poutine|johnny|reid|tarot|299/i.test(JSON.stringify(e)))})),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
