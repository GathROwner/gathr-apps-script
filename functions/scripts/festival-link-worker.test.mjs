// Sanitized in-memory database controls; no credentials, production IDs, API or database access.
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {FESTIVAL_EVIDENCE_POLICY,FESTIVAL_PREVIOUS_EVIDENCE_POLICY,festivalEvidenceSourceFingerprint,festivalEvidenceEditionFingerprint} from './festival-evidence-extractor.mjs';
const require=createRequire(import.meta.url),{runFestivalLinkWorker}=require('../lib/services/festivalLinkWorker.js'),{reviewedFestivalEdition}=require('../lib/services/festivalEditionRegistry.js'),{festivalShadowFingerprint}=require('../lib/services/festivalLinkShadowJob.js');
class Database{
 values=new Map();sequence=100;writes=[];afterClaim;
 constructor(entries){for(const [p,d]of entries)this.values.set(p,{data:d,version:++this.sequence});}
 doc(p){return{path:p,id:p.split('/').at(-1),get:async()=>this.snapshot(p)};}
 snapshot(p){const v=this.values.get(p),ref=this.doc(p);return{ref,id:ref.id,exists:!!v,updateTime:v?{seconds:0,nanoseconds:v.version,toMillis:()=>v.version,toDate:()=>new Date(v.version)}:undefined,data:()=>v?.data,get:k=>k.split('.').reduce((x,n)=>x?.[n],v?.data)};}
 collection(name){return this.query(name,false);}
 collectionGroup(name){return this.query(name,true);}
 query(name,group,filters=[],sort,limit=Infinity){const q={query:true,name,group,filters,sort,limit};q.where=(key,op,value)=>this.query(name,group,[...filters,[key,op,value]],sort,limit);q.orderBy=(key,direction)=>this.query(name,group,filters,[key,direction],limit);q.limit=n=>this.query(name,group,filters,sort,n);q.get=async()=>{
  let docs=[...this.values.keys()].filter(p=>group?p.split('/').at(-2)===name:p.split('/').slice(0,-1).join('/')===name).map(p=>this.snapshot(p));
  for(const [k,op,v]of filters)docs=docs.filter(d=>op==='=='?d.get(k)===v:op==='>='?d.get(k)>=v:d.get(k)<=v);
  if(sort)docs.sort((a,b)=>(a.get(sort[0])>b.get(sort[0])?1:-1)*(sort[1]==='desc'?-1:1));docs=docs.slice(0,limit);return{docs,size:docs.length};};return q;}
 async getAll(...refs){return refs.map(r=>this.snapshot(r.path));}
 async runTransaction(fn){const pending=[];const tx={get:async r=>r.query?r.get():this.snapshot(r.path),getAll:(...refs)=>this.getAll(...refs),set:(r,d)=>pending.push([r.path,d]),create:(r,d)=>{assert(!this.values.has(r.path));pending.push([r.path,d]);},update:(r,d)=>{assert(this.values.has(r.path));pending.push([r.path,{...this.values.get(r.path).data,...d}]);}};
  const out=await fn(tx);for(const [p,d]of pending){this.values.set(p,{data:d,version:++this.sequence});this.writes.push(p);}if(pending.some(([p,d])=>p.startsWith('festival_link_jobs/')&&d.status==='running')&&this.afterClaim){const hook=this.afterClaim;this.afterClaim=undefined;hook(this);}return out;
 }
}
function fixture(){
 const caption='Unholy Night | October 17 | 7:00 pm | Tivoli Cinema\nThis screening is part of ANCHOR Fest 2026, presented by ANCHOR Fest.';
 const umbrella={locationScope:'area',cityLevelReviewId:'review_fixture',eventName:'ANCHOR Fest 2026',startDate:'2026-10-14',endDate:'2026-10-18',areaData:{version:1,status:'partial',sourceUrl:'https://festival.example/programme',locations:[{id:'venue_tivoli_fixture',label:'Tivoli Cinema',venueId:'tivoli_fixture',certainty:'confirmed',coordinates:{latitude:46.2,longitude:-63.1},linkedEventIds:['human_fixture']}]}};
 const review={status:'published',publishedEventPath:'events/festival_fixture',finalization:{action:'approve_publish',manual:{areaData:umbrella.areaData}},areaEventLinks:[]};
 const edition=reviewedFestivalEdition({path:'events/festival_fixture',data:umbrella},{path:'city_level_event_reviews/review_fixture',data:review},'2026-10-15');
 const a={kind:'festival_activity',scopeText:caption,membershipText:'This screening is part of ANCHOR Fest 2026, presented by ANCHOR Fest.',festivalNameText:'ANCHOR Fest',yearText:'2026',organizerText:'ANCHOR Fest',name:'Unholy Night',venueText:'Tivoli Cinema',dateText:'October 17',timeText:'7:00 pm',startDate:'2026-10-17',startTime:'19:00',eventText:'Unholy Night',ticketUrl:'',sourceIndices:[-1],verification:{index:0,accepted:true,reason:'literal verified source'}};
 const key=festivalShadowFingerprint({source:festivalEvidenceSourceFingerprint({caption,imageUrls:[]}),edition:festivalEvidenceEditionFingerprint(edition),policy:FESTIVAL_EVIDENCE_POLICY});
 const cache={captureKey:key,sourceId:'1111111111111',result:{version:1,complete:true,limitations:[],documents:[{index:-1,text:caption}],sourceText:caption,activities:[a],requests:[],sourceFingerprint:festivalEvidenceSourceFingerprint({caption,imageUrls:[]}),editionFingerprint:festivalEvidenceEditionFingerprint(edition),evidencePolicy:FESTIVAL_EVIDENCE_POLICY}};
 const db=new Database([
  ['events/festival_fixture',umbrella],['city_level_event_reviews/review_fixture',review],['venues/tivoli_fixture',{name:'Tivoli Cinema',latitude:46.2,longitude:-63.1}],
  ['venues/tivoli_fixture/events/child_fixture',{eventName:'Unholy Night',venueId:'tivoli_fixture',startDate:'2026-10-17',endDate:'2026-10-17',startTime:'19:00',isRecurring:'No'}],
  ['processing_locks/dataset_fixture',{fileId:'dataset_fixture',runId:'run_fixture',status:'completed',startedAt:{toMillis:()=>0}}],
  ['processed_datasets/dataset_fixture',{fileId:'dataset_fixture',processedAt:{toMillis:()=>100000}}],['batch_states/dataset_fixture_1',{fileId:'dataset_fixture',runId:'run_fixture',batchNumber:1,status:'completed',currentRowIndex:20,totalRows:20}],
  ['parse_snapshots/source_fixture',{fileId:'dataset_fixture',uniqueId:'1111111111111',facebookUrl:'https://social.example/posts/1111111111111',inputText:caption,venueId:'tivoli_fixture',rowMeta:{parserMode:'full5stage',mediaUrls:[]},stages:[{stage:'format',output:{stageArtifacts:{stage3InputKind:'caption_only',stage3Items:[{name:'Unholy Night',date:'2026-10-17'}]}}}]}],
  ['festival_link_captures/'+key,cache],['runtime_metadata/event_feed',{version:10}]
 ]);
 return{db,key,cache,options:{mode:'publish',fileId:'dataset_fixture',asOf:'2026-10-15'}};
}
test('actual worker publishes one verified link atomically, preserves public fields and replays without duplicate',async()=>{
 const {db,options}=fixture();let r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,1);assert.deepEqual(db.values.get('events/festival_fixture').data.areaData.locations[0].linkedEventIds,['human_fixture','child_fixture']);assert.equal(db.values.get('runtime_metadata/event_feed').data.version,11);
 assert(!db.writes.some(p=>p.startsWith('venues/')||p.startsWith('city_level_event_reviews/')));assert(!JSON.stringify(db.values.get('events/festival_fixture').data).includes('sourceText'));
 r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,0);assert.equal(db.values.get('runtime_metadata/event_feed').data.version,11);
});
test('shadow never changes public records; switching to publish re-evaluates the completed job',async()=>{
 const {db,options}=fixture();assert.equal((await runFestivalLinkWorker(db,{...options,mode:'shadow'})).eventWrites,0);assert(!db.writes.some(p=>p.startsWith('events/')));assert.equal((await runFestivalLinkWorker(db,options)).eventWrites,1);
});
test('local dry run uses the actual worker with zero remote writes and zero paid calls',async()=>{
 const {db,key,cache,options}=fixture();db.values.delete('festival_link_captures/'+key);const r=await runFestivalLinkWorker(db,{...options,dryRun:true,localCaptures:new Map([[key,cache]])});assert.equal(r.eventWrites,0);assert.deepEqual(r.reports[0].addedEventIds,['child_fixture']);assert.equal(r.paidSources,0);assert.equal(db.writes.length,0);
});
test('source errors are terminal holds, do not trigger repeated paid work or public changes',async()=>{
 const {db,key,options}=fixture();db.values.get('festival_link_captures/'+key).data={captureKey:key,error:'source_incomplete'};let r=await runFestivalLinkWorker(db,options);assert.equal(r.status,'held');assert.equal(r.eventWrites,0);r=await runFestivalLinkWorker(db,options);assert.equal(r.status,'already_held');assert(!db.writes.some(p=>p.startsWith('events/')));
});
test('active parser stops the worker before job claims or paid work',async()=>{
 const {db,options}=fixture();db.values.get('processing_locks/dataset_fixture').data.status='running';const r=await runFestivalLinkWorker(db,options);assert.equal(r.status,'parser_active');assert.equal(db.writes.length,0);
});
test('transaction rereads canonical query to catch a newly inserted ambiguous child',async()=>{
 const {db,options}=fixture();db.afterClaim=d=>{d.values.set('venues/tivoli_fixture/events/second_fixture',{data:{...d.values.get('venues/tivoli_fixture/events/child_fixture').data},version:++d.sequence});};await assert.rejects(runFestivalLinkWorker(db,options),/Canonical inventory changed/);assert(!db.writes.some(p=>p.startsWith('events/')));
});
test('manual removal is retained and cannot be undone by a later worker',async()=>{
 const {db,options}=fixture();await runFestivalLinkWorker(db,options);const doc=db.values.get('events/festival_fixture');doc.data.areaData.locations[0].linkedEventIds=['human_fixture'];doc.version=++db.sequence;const r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,0);assert.deepEqual(db.values.get('festival_link_publications/festival_fixture').data.suppressedEventIds,['child_fixture']);
});
test('bounded capture durably saves one verified source, then a later invocation publishes',async()=>{
 const {db,key,cache,options}=fixture();db.values.delete('festival_link_captures/'+key);const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;const value=calls===1?{complete:true,limitations:[],documents:cache.result.documents,activities:cache.result.activities}:{checks:[{index:0,accepted:true,reason:'literal match'}]};return new Response(JSON.stringify({id:'response_fixture_'+calls,status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:100,output_tokens:100}}),{status:200});};
 try{let r=await runFestivalLinkWorker(db,{...options,apiKey:'fixture_api_key'});assert.equal(r.status,'capture_progress');assert.equal(r.paidSources,1);assert.equal(r.eventWrites,0);assert.equal(calls,2);assert(db.values.has('festival_link_captures/'+key));assert(!db.writes.some(p=>p.startsWith('events/')));r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,1);assert.equal(calls,2);}finally{globalThis.fetch=oldFetch;}
});
test('exact reviewed nonmembership accounts for a gap without changing its capture or creating a link',async()=>{
 const {db,key,cache,options}=fixture();const error={captureKey:key,error:'source_incomplete'};db.values.get('festival_link_captures/'+key).data=error;
 db.values.set('festival_link_source_decisions/'+key,{version:++db.sequence,data:{version:1,kind:'reviewed_not_member',editionId:'festival_fixture',sourceId:'1111111111111',captureKey:key,sourceFingerprint:cache.result.sourceFingerprint,evidencePolicy:FESTIVAL_EVIDENCE_POLICY,reviewId:'review_fixture',reason:'Separate exhibition',reviewedAt:'2026-10-15T15:00:00Z'}});
 const r=await runFestivalLinkWorker(db,options);assert.equal(r.status,'completed');assert.equal(r.eventWrites,0);assert.equal(r.reports[0].reviewedNonmembers.length,1);assert.equal(r.reports[0].reviewedNonmembers[0].captureStillIncomplete,true);assert.deepEqual(db.values.get('festival_link_captures/'+key).data,error);
});
test('revoking a reviewed negative decision during publication aborts the transaction',async()=>{
 const {db,key,cache,options}=fixture();db.values.get('festival_link_captures/'+key).data={captureKey:key,error:'source_incomplete'};
 const p='festival_link_source_decisions/'+key;db.values.set(p,{version:++db.sequence,data:{version:1,kind:'reviewed_not_member',editionId:'festival_fixture',sourceId:'1111111111111',captureKey:key,sourceFingerprint:cache.result.sourceFingerprint,evidencePolicy:FESTIVAL_EVIDENCE_POLICY,reviewId:'review_fixture',reason:'Separate exhibition',reviewedAt:'2026-10-15T15:00:00Z'}});
 db.afterClaim=d=>d.values.delete(p);await assert.rejects(runFestivalLinkWorker(db,options),/reference_drift/);assert(!db.writes.some(p=>p.startsWith('events/')));
});
test('reviewed nonmembership without a complete cached capture still reports the source limitation',async()=>{
 const {db,key,cache,options}=fixture();db.values.delete('festival_link_captures/'+key);db.values.set('festival_link_source_decisions/'+key,{version:++db.sequence,data:{version:1,kind:'reviewed_not_member',editionId:'festival_fixture',sourceId:'1111111111111',captureKey:key,sourceFingerprint:cache.result.sourceFingerprint,evidencePolicy:FESTIVAL_EVIDENCE_POLICY,reviewId:'review_fixture',reason:'Separate exhibition with unreadable small wall text',reviewedAt:'2026-10-15T15:00:00Z'}});
 const r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,0);assert.equal(r.paidSources,0);assert.equal(r.reports[0].reviewedNonmembers[0].captureStillIncomplete,true);
});
function legacyFixture(){
 const f=fixture(),oldKey=festivalShadowFingerprint({source:f.cache.result.sourceFingerprint,edition:f.cache.result.editionFingerprint,policy:FESTIVAL_PREVIOUS_EVIDENCE_POLICY});
 f.db.values.delete('festival_link_captures/'+f.key);const previous={...f.cache,captureKey:oldKey,result:{...f.cache.result,evidencePolicy:FESTIVAL_PREVIOUS_EVIDENCE_POLICY}};
 f.db.values.set('festival_link_captures/'+oldKey,{data:previous,version:++f.db.sequence});return{...f,oldKey,previous};
}
test('prior exact source captures revalidate without model work, copying or overwriting their evidence',async()=>{
 const {db,key,oldKey,previous,options}=legacyFixture();const before=JSON.stringify(previous);
 const r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,1);assert.equal(r.paidSources,0);assert.equal(JSON.stringify(db.values.get('festival_link_captures/'+oldKey).data),before);assert(!db.values.has('festival_link_captures/'+key));
});
test('prior exact reviewed nonmember keeps its original approval and incomplete-source flag',async()=>{
 const {db,oldKey,previous,options}=legacyFixture();db.values.get('festival_link_captures/'+oldKey).data={captureKey:oldKey,error:'source_incomplete'};
 db.values.set('festival_link_source_decisions/'+oldKey,{version:++db.sequence,data:{version:1,kind:'reviewed_not_member',editionId:'festival_fixture',sourceId:'1111111111111',captureKey:oldKey,sourceFingerprint:previous.result.sourceFingerprint,evidencePolicy:FESTIVAL_PREVIOUS_EVIDENCE_POLICY,reviewId:'review_fixture',reason:'Separate exhibition',reviewedAt:'2026-10-15T15:00:00Z'}});
 const r=await runFestivalLinkWorker(db,options);assert.equal(r.eventWrites,0);assert.equal(r.paidSources,0);assert.equal(r.reports[0].reviewedNonmembers[0].captureStillIncomplete,true);
});
test('a newer policy record blocks legacy fallback; creation during publication fences old evidence',async()=>{
 let f=legacyFixture();f.db.values.set('festival_link_source_decisions/'+f.key,{version:++f.db.sequence,data:{kind:'revoked'}});
 assert.equal((await runFestivalLinkWorker(f.db,{...f.options,dryRun:true})).status,'source_evidence_not_captured');
 f=legacyFixture();f.db.afterClaim=d=>d.values.set('festival_link_source_decisions/'+f.key,{version:++d.sequence,data:{kind:'revoked'}});
 await assert.rejects(runFestivalLinkWorker(f.db,f.options),/reference_drift/);assert(!f.db.writes.some(p=>p.startsWith('events/')));
});
