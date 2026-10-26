// Offline source/visible-answer equality checks. No model, Firestore or HTTP calls.
// Usage: node scripts/post-reuse-saved-source-playback.cjs <measurement-artifact-dir>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const reuse=require('../lib/parsing/postResponseReuse.js');
const evidence=path.resolve(process.argv[2]||'');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const details=read(path.join(evidence,'repeat-details.json'));
const provenance=read(path.join(evidence,'source-provenance.json'));
const sourceDays=new Map(), imageHashes=new Map();
function load(day){if(sourceDays.has(day))return sourceDays.get(day);
 const snapshot=read(provenance.find(p=>p.day===day&&p.kind==='snapshots').path);
 const m=read(provenance.find(p=>p.day===day&&p.kind==='media').path),media=Array.isArray(m)?m:m.results;
 const rows=new Map(snapshot.map(s=>[(s.data||s).rowIndex,s.data||s]));
 const result={rows,media};sourceDays.set(day,result);return result;}
function sourceInput(snapshot){const m=snapshot.rowMeta;return{inputText:snapshot.inputText,pageName:m.pageName,userName:m.userName,
 timestamp:m.timestamp,sharedPostAuthorName:m.sharedPostAuthorName||'',sharedPostAuthorUrl:m.sharedPostAuthorUrl||'',
 sharedPostUrl:m.sharedPostUrl||'',sharedPostTimestamp:m.sharedPostTimestamp||''};}
function register(day,row){const d=load(day);const snapshot=d.rows.get(row);assert(snapshot);
 for(const url of snapshot.rowMeta.mediaUrls||[]){const m=d.media.find(x=>Number(x.row)===row&&x.url===url);assert(m);
  const p=(m.path||m.file).replaceAll('\\\\','\\');const hash=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  imageHashes.set(url,hash);}
 return snapshot;}
(async()=>{const results=[];let overBudget=0,missingValidation=0;
 for(const row of details.filter(x=>x.kind==='cross_day'&&x.confirmedOriginalImageBytesMatch)){
  const old=register(Number(row.priorDate.slice(-2)),row.priorRowIndex),next=register(row.day,row.rowIndex);
  const images=old.rowMeta.mediaUrls||[];if(images.length>4){overBudget++;continue;}
  const validation=old.stages.find(s=>s.output?.stageArtifacts?.stage1Validation)?.output.stageArtifacts.stage1Validation;
  if(!validation){missingValidation++;continue;}
  const records=new Map(),store={load:async id=>records.get(id),save:async(id,r)=>records.set(id,r)};
  const hasher=async url=>{assert(imageHashes.has(url));return imageHashes.get(url);};
  const args={source:sourceInput(old),identity:{postId:old.uniqueId,publisher:old.facebookUrl},imageUrls:images,
   policyHash:reuse.reuseDigest('offline-transport-fixture-not-production-policy'),fence:{fileId:old.fileId,runId:'offline-prior',workerId:'offline-worker'},
   hasher,store,now:()=>1000};
  const request=s=>({model:'gpt-6-luna',input:[{role:'user',content:[{type:'input_text',text:s.inputText},
   ...(s.rowMeta.mediaUrls||[]).map(image_url=>({type:'input_image',image_url,detail:'high'}))]}]});
  const visible=JSON.stringify(validation),reply={status:'completed',output:[{type:'message',content:[{type:'output_text',text:visible}]}]};
  const warm=await reuse.createPostResponseReuseSession(args);
  await reuse.runWithPostResponseReuse(warm,async()=>{await warm.invoke('responses',request(old),async()=>reply);
   reuse.notePostResponseReuseDocument(`venues/${old.venueId||'offline-unresolved'}`);reuse.approvePostResponseReuse();});
  assert.equal(await warm.commit(),true);
  const consumer=await reuse.createPostResponseReuseSession({...args,source:sourceInput(next),imageUrls:next.rowMeta.mediaUrls||[],
   identity:{postId:next.uniqueId,publisher:next.facebookUrl},fence:{fileId:next.fileId,runId:'offline-next',workerId:'offline-worker'},now:()=>2000});
  let modelCalls=0;const out=await consumer.invoke('responses',request(next),async()=>{modelCalls++;return reply;});
  assert.equal(modelCalls,0);assert.equal(out.output[0].content[0].text,visible);
  assert.deepEqual(JSON.parse(out.output[0].content[0].text),validation);
  results.push({date:row.date,sourceId:row.id,originalImages:images.length,visibleJsonIdentical:true,hits:consumer.metrics.hits});
 }
 const receipt={atUTC:new Date().toISOString(),status:'PASS',scope:'Saved-source byte identity and visible JSON transport equality only',
  candidateRows:details.filter(x=>x.kind==='cross_day'&&x.confirmedOriginalImageBytesMatch).length,verifiedRows:results.length,
  overFourImageBudget:overBudget,missingSavedValidation:missingValidation,rows:results,liveReads:0,liveWrites:0,paidModelCalls:0,
  limitations:'Rebuilt request envelopes and saved normalized Stage1 validation JSON; not original raw provider request/response recordings. This does not establish model-quality equivalence, live document-pin validity, real cache-hit coverage or network latency.'};
 const out=path.resolve('artifacts/post-reuse-oct26/saved-source-playback.json');fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({...receipt,rows:undefined,output:out}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
