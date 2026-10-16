// Explicit local-only historical source test. Never calls parser endpoints or writes Firestore.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {extractFestivalEvidence} from '../functions/scripts/festival-evidence-extractor.mjs';
const root=path.resolve('functions/artifacts/festival-week-oct15');
const inventory=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const cases=[
 {sourceId:'1539985468169427',id:'local_pumpkin_2026',name:'Summerside Pumpkin Festival',year:2026,startDate:'2026-10-15',endDate:'2026-10-31'},
 {sourceId:'1723566179778895',id:'local_harvest_2026',name:'Harvest Fest',year:2026,startDate:'2026-10-17',endDate:'2026-10-17'},
];
const reports=[];
for(const edition of cases){
 const source=inventory.sources.find(s=>s.uniqueId===edition.sourceId);assert(source);
 const dir=path.join(root,edition.id);await fs.mkdir(dir,{recursive:true});
 const file=path.join(dir,'capture.json');
 try{await fs.access(file);throw Error('Existing capture; do not pay again');}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const [i,url]of source.rowMeta.mediaUrls.entries()){
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,'Gallery unavailable');
  await fs.writeFile(path.join(dir,`original-${i}.jpg`),Buffer.from(await response.arrayBuffer()));
 }
 const capture={id:source.uniqueId,sourceUrl:source.facebookUrl,caption:source.inputText||'',imageUrls:source.rowMeta.mediaUrls};
 let result,error,diagnostics;
 try{result=await extractFestivalEvidence({...capture,edition,apiKey:process.env.OPENAI_API_KEY,verify:true});}
 catch(e){error=e.message;diagnostics=e.evidenceDiagnostics;}
 await fs.writeFile(file,JSON.stringify({localProposedEditionOnly:true,notReviewedForPublication:true,edition,capture,result,error,diagnostics},null,2));
 const requests=result?.requests||diagnostics?.requests||[];
 reports.push({edition:edition.name,sourceId:source.uniqueId,error,complete:result?.complete,activities:result?.activities,limitations:result?.limitations,requests});
 console.log(JSON.stringify({edition:edition.name,complete:result?.complete,error,activities:result?.activities.length,calls:requests.length}));
}
await fs.writeFile(path.join(root,'local-trials.json'),JSON.stringify({checkedAt:new Date().toISOString(),reports,liveWrites:0,publicationEligible:false},null,2));
