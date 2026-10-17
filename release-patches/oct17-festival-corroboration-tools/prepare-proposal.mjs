import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {FrozenDatabase} from './frozen-database.mjs';
const require=createRequire(new URL('./assembly/package.json',import.meta.url));
const {runFestivalLinkWorker}=require('./lib/services/festivalLinkWorker.js');
const {reviewedFestivalEdition}=require('./lib/services/festivalEditionRegistry.js');
const {festivalShadowFingerprint:fp}=require('./lib/services/festivalLinkShadowJob.js');
const {festivalVenueMentionLabel,isFestivalTicketHomepage}=require('./lib/services/festivalLinker.js');
const {festivalCaptureSource}=require('./lib/services/festivalCaptureSource.js');
const extractor=await import('./assembly/scripts/festival-evidence-extractor.mjs');
const root='C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/';
const inventoryPath=process.argv[2]||root+'functions/artifacts/oct17-corroboration-preflight/live-inventory.json';
const inventory=JSON.parse(await fs.readFile(inventoryPath,'utf8'));
assert.equal(inventory.readOnly,true);assert.equal(inventory.projectId,'gathr-migrated');
const db=new FrozenDatabase(inventory.entries),original=structuredClone([...db.entries.values()]);
globalThis.fetch=async()=>{throw Error('Offline network forbidden');};
const options={mode:'publish',dryRun:true,asOf:'2026-10-17',fileId:'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g'};
const baseline=await runFestivalLinkWorker(db,options);
const umbrella=db.snapshot('venues/slug_foundersfoodhall/events/01q4d8wzK8R8VH0revQX');
const review=db.snapshot('festival_programme_reviews/harvest_2026_founders');
const doc=d=>({path:d.ref.path,data:JSON.parse(JSON.stringify(d.data())),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}});
const u=doc(umbrella),r=doc(review),edition=reviewedFestivalEdition(u,r,options.asOf);assert(edition);
const webRoot=root+'firebase/artifacts/oct17-festival-corroboration-web/';
const http=JSON.parse(await fs.readFile(webRoot+'public-http-receipts.json','utf8')).results.find(x=>x.id==='harvest');
assert.equal(http.status,200);assert.equal(http.finalUrl,edition.sourceIds.find(x=>x===http.url));
const sha=s=>createHash('sha256').update(s).digest('hex');
const body=await fs.readFile(webRoot+http.textFile,'utf8'),httpBody=await fs.readFile(webRoot+http.bodyFile,'utf8');
assert.equal(sha(httpBody),http.sha256);
const sitePath='festival_website_evidence/'+edition.id;
const website={version:1,editionId:edition.id,url:http.url,body,bodySha256:sha(body),httpBody,httpBodySha256:sha(httpBody),observedAt:http.checkedAt};
const excerpt=text=>{const start=body.indexOf(text);assert(start>=0,text);assert.equal(body.indexOf(text,start+text.length),-1,'Ambiguous website excerpt');return{start,end:start+text.length,text};};
const header={...excerpt('Harvest Fest at Founders’ Food Hall & Market Saturday, October 17, 2026 | 3:00 to 8:00 pm'),dateText:'October 17, 2026',date:'2026-10-17',year:2026};
const rows=[['Salty Sailors','3:00 to 5:00 pm','15:00','17:00'],['Vintage 4.0','6:00 to 8:00 pm','18:00','20:00'],['Outdoor Play Zone','2:00 to 7:00 pm','14:00','19:00'],['Firepits','3:00 to 8:00 pm','15:00','20:00'],['Photo Booth with printable keepsakes','3:00 to 7:00 pm','15:00','19:00'],['Live Pumpkin Carving Contest','4:00 to 7:00 pm','16:00','19:00']].map(([name,time,startTime,endTime])=>({...excerpt(name+' | '+time),name:name.startsWith('Photo Booth')?'Photo Booth':name,startTime,endTime}));
const editions=[...db.entries.values()].filter(x=>x.data.locationScope==='area'||x.data.programmeReviewId).map(x=>{const reviewPath=x.data.programmeReviewId?'festival_programme_reviews/'+x.data.programmeReviewId:'city_level_event_reviews/'+x.data.cityLevelReviewId;const rev=db.entries.get(reviewPath);return rev&&reviewedFestivalEdition(x,rev,options.asOf);}).filter(Boolean);
const venues=[...db.entries.values()].filter(x=>/^venues\/[^/]+$/.test(x.path)).map(x=>({id:x.path.split('/')[1],label:x.data.name||x.data.venueName||x.data.establishment||'',aliases:[...(x.data.aliases||[]),...editions.flatMap(e=>e.venueAliases[x.path.split('/')[1]]||[])],latitude:Number(x.data.latitude),longitude:Number(x.data.longitude)}));
const pin=d=>({path:d.path,version:d.version,fingerprint:fp(d.data)});
const reviewed=new Map([
 ['LIVE PUMPKIN CARVING CONTEST',{path:'venues/slug_foundersfoodhall/events/oct16harvest_pumpkincarving_20261017_1600',rowIndex:5}],
 ['PHOTO BOOTH',{path:'venues/slug_foundersfoodhall/events/oct16harvest_photobooth_20261017_1500',rowIndex:4}],
 ['VINTAGE 4.0',{path:'venues/slug_foundersfoodhall/events/qBimPRIGiW8A8EqMHxYj',rowIndex:1}],
 ['Harvest Fest',{path:u.path,rowIndex:-1}],
]);
const documents=[{path:sitePath,after:website}],bundles=new Map(),sourceEvidence=[];
for(const sid of ['1725796586222521','1566791205488411']){
 const matches=[...db.entries.values()].filter(x=>x.path.startsWith('parse_snapshots/')&&x.data.fileId===options.fileId&&x.data.uniqueId===sid).sort((a,b)=>Date.parse(b.updateTime)-Date.parse(a.updateTime));assert(matches.length);
 const source=db.snapshot(matches[0].path),s=source.data(),item={source,caption:s.inputText,imageUrls:s.rowMeta.mediaUrls};
 const sf=extractor.festivalEvidenceSourceFingerprint(item),ef=extractor.festivalEvidenceEditionFingerprint(edition);
 const captures=[...db.entries.values()].filter(x=>x.path.startsWith('festival_link_captures/')&&x.data.sourceId===sid&&x.data.result?.sourceFingerprint===sf&&x.data.result?.editionFingerprint===ef);assert.equal(captures.length,1);
 const capture=captures[0].data,key=capture.captureKey,cs=festivalCaptureSource(capture,{...item,key},extractor.festivalEvidenceSourceFingerprint);
 const result=extractor.validateFestivalEvidenceCapture(capture.result,cs);
 for(const[index,a]of result.activities.entries()){
  const target=reviewed.get(a.name);if(!target)continue;assert.equal(a.verification.accepted,true);
  const vm=venues.filter(v=>festivalVenueMentionLabel(v,a.venueText));assert(vm.length<=1);
  const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const named=Boolean(a.activityRowText&&a.dateHeaderText&&normalize(a.eventText).startsWith(normalize(edition.name))&&normalize(a.eventText).length>normalize(edition.name).length);
  const proposed=edition.sourceBindings[sid],publisher=url=>{try{const u=new URL(url);return u.origin+u.pathname.replace(/\/$/,'')+u.search;}catch{return '';}};
  const binding=proposed&&(!proposed.sourceFingerprint||proposed.sourceFingerprint===sf&&publisher(proposed.sourceUrl)===publisher(s.facebookUrl))?proposed:undefined;
  const evidence={id:'e_'+fp({source:sid,index,scope:a.scopeText}).slice(0,40),source:{id:sid,url:s.facebookUrl,text:result.sourceText,documents:result.documents,publisherId:'publisher_'+fp(s.facebookUrl||'').slice(0,24),revision:source.updateTime.toDate().toISOString(),...(binding?{organizerId:binding.organizerId}:{})},kind:named?'same_source_named_activity':a.kind,scopeText:a.scopeText,membershipText:named?a.eventText:a.membershipText,festivalNameText:a.festivalNameText,yearText:a.yearText,organizerText:a.organizerText,...(a.activityRowText?{activityRowText:a.activityRowText,dateHeaderText:a.dateHeaderText}:{}),...(a.captionScope?{captionScope:a.captionScope}:{}),...(a.sourceScope?{sourceScope:a.sourceScope}:{}),...(a.sharedCaptionScope?{sharedCaptionScope:a.sharedCaptionScope}:{}),activity:{name:a.name,venueId:vm.length===1?vm[0].id:'',startDate:a.startDate,startTime:a.startTime,...(a.ticketUrl&&!isFestivalTicketHomepage(a.ticketUrl)?{ticketUrl:a.ticketUrl}:{})},eventText:a.eventText,dateText:a.dateText,timeText:a.timeText,venueText:a.venueText};
  const previous=baseline.reports.find(x=>x.editionId===edition.id).outcomes.find(x=>x.id===evidence.id);assert(previous);assert.equal(fp(evidence),previous.evidenceFingerprint,'Worker source reconstruction mismatch');
  const child=doc(db.snapshot(target.path));
  const receipt={version:1,kind:target.path===u.path?'reviewed_umbrella_self_reference':'reviewed_existing_member',reviewId:'oct17_harvest_existing_members_v1',reviewedAt:inventory.capturedAt,editionId:edition.id,editionFingerprint:fp(edition),sourceId:sid,sourceVenueText:evidence.venueText,sourceFingerprint:sf,captureKey:key,evidencePolicy:result.evidencePolicy,evidenceId:evidence.id,evidenceFingerprint:fp(evidence),activityFingerprint:fp(a),review:pin(r),umbrella:pin(u),website:{path:sitePath,url:website.url,bodySha256:website.bodySha256,httpBodySha256:website.httpBodySha256,venueText:'Founders’ Food Hall & Market',header,rows},rowIndex:target.rowIndex,canonical:{...pin(child),name:child.data.eventName,venueId:child.data.venueId,date:child.data.startDate,startTime:child.data.startTime,endTime:child.data.endTime}};
  if(!evidence.activity.venueId)receipt.venueBinding={sourcePublisherUrl:evidence.source.url,officialWebsiteOrigin:new URL(website.url).origin,canonical:pin(doc(db.snapshot('venues/'+child.data.venueId)))};
  const list=bundles.get(key)||[];list.push(receipt);bundles.set(key,list);sourceEvidence.push({evidence,activity:a,receipt});
 }
}
for(const[key,receipts]of bundles)documents.push({path:'festival_link_corroborations/'+key,after:{version:1,receipts}});
assert.equal(sourceEvidence.length,4);assert.equal(documents.length,3);
for(const d of documents){const before=db.entries.get(d.path);assert(!before,'Proposal requires no existing receipt document');d.before={exists:false};db.entries.set(d.path,{path:d.path,exists:true,version:{seconds:1792267200,nanoseconds:0},data:d.after});}
const proposed=await runFestivalLinkWorker(db,options),harvest=proposed.reports.find(x=>x.editionId===edition.id);
assert.equal(harvest.outcomes.filter(x=>x.status==='corroborated').length,3);assert.equal(harvest.outcomes.filter(x=>x.status==='self_reference').length,1);assert.equal(harvest.outcomes.filter(x=>x.status==='held').length,2);assert.deepEqual(harvest.addedEventIds,[]);
assert(proposed.reports.every(x=>x.reason==='no_public_delta'));assert.equal(proposed.eventWrites,0);assert.equal(proposed.paidSources,0);assert.equal(db.writes.length,0);
for(const before of original)assert.deepEqual(db.entries.get(before.path),before,'Original inventory changed');
const proposal={version:1,offlineOnly:true,inventoryPath,capturedAt:inventory.capturedAt,servingBaseline:{commit:'938320ddce85c331d5361f22b5e0ed77abc2f91d',sourceHash:'24edc95235106a71b30b2712d06b504d9d3bd2e1'},reviewRequired:true,privateDocuments:documents,publicAdditions:[],publicRemovals:[],sourceProvenanceMutations:[],captureMutations:[],retainedHolds:['Outdoor Play Zone: printed 18:00 versus website 19:00 finish','Firepits: distinct occurrence identity remains unproved'],effects:proposed};
for(const[name,value]of Object.entries({baseline,proposed,proposal,'source-evidence':sourceEvidence}))await fs.writeFile(new URL('./'+name+'.json',import.meta.url),JSON.stringify(value,null,2));
console.log(JSON.stringify({capturedAt:inventory.capturedAt,sourceCount:proposed.sourceCount,privateDocumentCreates:documents.length,receipts:sourceEvidence.length,harvest:harvest.outcomes.map(o=>({id:o.id,status:o.status,reason:o.reason})),publicAdditions:[],publicRemovals:[],sourceProvenanceMutations:[],captureMutations:[],eventWrites:0,paidSources:0},null,2));
