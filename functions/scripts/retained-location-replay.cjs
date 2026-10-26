// Actual deterministic parser/formatter/routing/matcher code. Provider output is a retained post-format stub.
// No LLM/OCR regeneration, media fetch, global-catalog uniqueness proof or live processing is claimed.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert(globalThis.__retainedSafety,'Use the mandatory offline guard preload');
const root=path.resolve(__dirname,'..'),base=path.resolve(process.argv[2]||root);
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/retained-location-oct18.json'),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
let catalog=clone(fixture.venues),providerResponse,stubCalls=0;
globalThis.__retainedSetCatalog=values=>{catalog=clone(values);};
const mutation=()=>{globalThis.__retainedSafety.writeAttempts++;throw Error('Fake datastore refuses all writes');};
function query(collection,filters=[],limit=Infinity){
 return {where:(...f)=>query(collection,[...filters,f],limit),limit:n=>query(collection,filters,n),orderBy:()=>query(collection,filters,limit),select:()=>query(collection,filters,limit),
  doc:id=>({id,get:async()=>{const v=collection==='venues'?catalog.find(x=>x.id===id):null;return{id,exists:!!v,data:()=>clone(v)};},set:mutation,update:mutation,delete:mutation,create:mutation}),
  get:async()=>{assert.equal(collection,'venues','Unexpected catalog collection read');const values=catalog.filter(v=>filters.every(([k,op,w])=>op==='=='?v[k]===w:op==='array-contains'?Array.isArray(v[k])&&v[k].includes(w):false)).slice(0,limit);const docs=values.map(v=>({id:v.id,data:()=>clone(v)}));return{docs,size:docs.length,empty:docs.length===0};},add:mutation};
}
globalThis.__retainedFakeDB={settings:()=>{},collection:n=>query(n),batch:mutation,runTransaction:mutation,doc:()=>({set:mutation,update:mutation,delete:mutation})};
globalThis.__retainedProviderReply=()=>{stubCalls++;return clone(providerResponse);};
const origJS=Module._extensions['.js'];const instrumented=[];
Module._extensions['.js']=function(mod,filename){
 if(!filename.startsWith(base+path.sep))return origJS(mod,filename);
 let text=fs.readFileSync(filename,'utf8');const originalSHA256=crypto.createHash('sha256').update(text).digest('hex');
 if(filename.endsWith(path.join('parsing','finalFormatter.js'))){
  // Only replace the paid-provider boundary, preserving all deterministic Stage5 logic.
  const ts=require(path.join(root,'node_modules/typescript'));
  const ast=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const fn=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text==='callGPTWithSchema');assert(fn?.body);
  text=text.slice(0,fn.body.getStart(ast))+'{ return globalThis.__retainedProviderReply(); }'+text.slice(fn.body.end);
  instrumented.push({file:path.relative(base,filename),originalSHA256,boundary:'callGPTWithSchema body only: retained post-format output, not raw provider response'});
 }
 if(filename.endsWith(path.join('services','firestoreService.js'))){assert(text.includes('const db = admin.firestore();'));text=text.replace('const db = admin.firestore();','const db = globalThis.__retainedFakeDB;');instrumented.push({file:path.relative(base,filename),originalSHA256,boundary:'Firestore reads replaced with reduced in-memory catalog; every write throws'});}
 mod._compile(text,filename);
};
const formatter=require(path.join(base,'lib/parsing/finalFormatter.js'));
const spatial=require(path.join(base,'lib/parsing/spatialEventClassifier.js'));
const rowProcessor=require(path.join(base,'lib/processing/rowProcessor.js'));
const datastore=require(path.join(base,'lib/services/firestoreService.js'));
const ownershipFile=path.join(base,'lib/parsing/occurrenceSourceOwnership.js');const ownership=fs.existsSync(ownershipFile)?require(ownershipFile):null;
const report={mode:fixture.mode,sourceBase:base,modelRegeneration:false,rawStage5ProviderResponse:false,providerStub:'saved post-format events replayed through actual deterministic formatter',catalogCoverage:fixture.catalogCoverage,rows:[],instrumented};
async function route(event,source,row){
 const area=rowProcessor.resolvePostDerivedCityLevelEventLocation({item:event,row,establishment:source.establishment});
 const attempts=[];const venue=await rowProcessor.resolveVenueForFullParserEventWithMatcherForRegression({item:event,row,rowVenue:null,establishment:source.establishment,rowIndex:source.rowIndex,
  matcher:async(name,url,context)=>{const match=await datastore.findMatchingVenue(name,url,context);attempts.push({name,matchType:match.matchType,venueId:match.matchedVenue?.id||null});return match;},
  addressMatcher:async address=>datastore.findVenueByAddress(address)});
 return {areaKind:area?.spatialEvidence?.kind||area?.locationScope||null,venueId:venue?.id||null,disposition:area?'area_review':venue?'existing_venue':'hold_unresolved_point',attempts};
}
module.exports=(async()=>{
 for(const source of fixture.rows){
  const a=source.stage4Items,e=source.savedPostFormatEvents;assert.equal(source.row.uniqueId,source.sourceUniqueId);assert.equal(a.length,e.length);
  const identities=a.map(i=>[i.name,i.date,i.startTime].join('|'));assert.equal(new Set(identities).size,identities.length,'Ambiguous captured source identity');
  const prepared=ownership?a.map(i=>ownership.prepareOccurrenceSourceItem(clone(i),source.combinedText)):clone(a);
  providerResponse={formattedEvents:clone(e),formattingDecisions:[]};
  let output=await formatter.performFinalFormatting(prepared,source.establishment,'',source.row.timestamp,{stage5BatchSize:0},source.combinedText);
  if(ownership)output=ownership.restoreOccurrenceSourceOwnership(output,prepared);
  assert.equal(output.length,e.length,'Deterministic formatter lost source events');
  for(let i=0;i<output.length;i++){
   const event=output[i],sourceItem=prepared.find(x=>x.name===event.name&&x.date===event.startDate&&x.startTime===event.startTime);assert(sourceItem,'Occurrence binding drift');
   if(sourceItem.spatial&&base===root)assert.deepEqual(event.spatial,sourceItem.spatial,'Original spatial evidence must survive formatting');
   const isTarget=source.rowIndex!==214||event.name==='Artisans Christmas Market';if(!isTarget)continue;
   const before=await route(e.find(x=>x.name===event.name&&x.startDate===event.startDate&&x.startTime===event.startTime),source,source.row);
   const actual=await route(event,source,source.row);
   report.rows.push({fileId:source.fileId,rowIndex:source.rowIndex,sourceUniqueId:source.sourceUniqueId,name:event.name,date:event.startDate,start:event.startTime,end:event.endTime,
    sourceItemHash:hash(sourceItem),sourceSpatialPresent:'spatial' in sourceItem,sourceSpatialHash:sourceItem.spatial?hash(sourceItem.spatial):null,outputSpatialHash:event.spatial?hash(event.spatial):null,
    additionalLocation:event.additionalLocation,establishment:event.establishment,recurrence:event.recurringPattern,sourceCompleteness:source.binding.inputComplete,captionLength:source.row.text.length+source.row.sharedPostText.length,
    savedOutputRouting:before,reformattedRouting:actual});
  }
 }
 report.stubProviderCalls=stubCalls;report.safety=globalThis.__retainedSafety;assert(Object.values(report.safety).every(v=>v===0),'Unexpected blocked access attempted');
 if(require.main===module)console.log('RETAINED_REPORT:'+JSON.stringify(report));
 return report;
})();
if(require.main===module)module.exports.catch(e=>{console.error(e.stack);process.exitCode=1});
