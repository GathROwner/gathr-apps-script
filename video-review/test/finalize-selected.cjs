const fs=require('node:fs/promises'),{isDeepStrictEqual}=require('node:util');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison',repo='C:/Users/craig/.codex/worktrees/video-model-comparison/gathr-apps-script';
(async()=>{
 await auth.signIn();const cap=JSON.parse(await fs.readFile(root+'/selected-publication/CAPTURE.json','utf8'));
 const ota=JSON.parse(await fs.readFile(root+'/hokum-longer-trial/OTA_VERIFIED.json','utf8'));
 const hokum=JSON.parse(await fs.readFile(root+'/hokum-longer-trial/PUBLICATION_VERIFIED.json','utf8'));
 const cost=JSON.parse(await fs.readFile(root+'/hokum-longer-trial/RESULT.json','utf8'));
 const statuses=[];
 for(const row of cap.selected){const d=await auth.get(row.candidate.name.split('/documents/')[1]),c=auth.data(d),before=auth.data(row.candidate);if(!isDeepStrictEqual(c.humanJudgment,before.humanJudgment))throw Error('Human choice drift');if(c.sourcePostId!==before.sourcePostId||c.sourceVideoId!==before.sourceVideoId)throw Error('Source identity drift');statuses.push({sourceVideoId:c.sourceVideoId,...c.manualPublication});}
 const assets=(await auth.query('listing_video_assets',null)).map(auth.data),links=(await auth.query('listing_video_links',null)).map(auth.data);
 if(assets.some(x=>x.state!=='ready')||links.some(x=>x.state!=='ready'))throw Error('Unfinished public reservations');
 const paths=links.map(x=>x.binding.path),r=await fetch('https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths})});
 const rpc=await r.json();if(!r.ok||paths.some(x=>!rpc.videos[x]))throw Error('Public video registry is not resolving');
 const config=auth.data(await auth.get('runtime_metadata/video_review'));if(!config.enabled||config.automaticPublication!==false)throw Error('Video review gate drift');
 const idle=await auth.idle();if(idle.checkpointCount!==0)throw Error('Parser checkpoint present');
 const functions=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions');
 const parser=functions.functions.filter(f=>['processDataset','processDatasetResume','processDatasetSelectedRows'].includes(f.name.split('/').at(-1)));
 if(parser.length!==3||parser.some(f=>f.labels?.['firebase-functions-hash']!=='e179029b583fc29c700f8c66e4ca39beb259f6df'))throw Error('Accepted parser code changed');
 const counts=statuses.reduce((o,x)=>(o[x.state]=(o[x.state]||0)+1,o),{});if(counts.published!==5||counts.already_covered!==4||counts.held!==3)throw Error('Unexpected final selection accounting');
 const result={atUTC:new Date().toISOString(),selected:statuses.length,counts,decisions:statuses,humanChoicesPreserved:true,eventWrites:0,photosChanged:false,
  publicRegistry:{assets:assets.length,listingLinks:links.length,bytes:assets.reduce((n,x)=>n+x.plan.probe.bytes,0),allLinksResolve:true},
  hokum:{durationSeconds:hokum.seconds,bytes:hokum.bytes,paths:hokum.paths,reviewFrames:cost.frames,lunaUSD:cost.review.callSummary.estimatedNewCostUSD,transcriptionUSD:cost.transcriptionEstimatedUSD,totalEstimatedAPIUSD:cost.review.callSummary.estimatedNewCostUSD+cost.transcriptionEstimatedUSD,terraCalls:0,basis:cost.costBasis,pricing:'https://developers.openai.com/api/docs/pricing'},
  ota,parserUnchanged:true,privateReviewEnabled:true,automaticPublication:false,dailyReviewDurationLimitUnchanged:60,
  verification:{newVideoPublicHashes:true,newVideoHTTP206:true,nativeEventVersionsUnchanged:true,focusedPublicationTests:4,focusedPlaybackTests:24,renderedPhonePlayer:true,physicalIosAdoption:'Not yet confirmed'},
  evidenceDirectory:root};
 await fs.writeFile(root+'/selected-publication/FINAL_ACCOUNTING.json',JSON.stringify(result,null,2),{flag:'wx'});
 await fs.writeFile(repo+'/docs/oct30-selected-videos-and-hokum-release.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({selected:result.selected,counts,registry:result.publicRegistry,hokum:result.hokum,ota:result.ota,parserUnchanged:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
