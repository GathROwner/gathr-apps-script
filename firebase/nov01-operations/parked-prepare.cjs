'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('./parked-create.cjs'),{C,OWNER,typed,plain,clone,read}=P;
const ROOT='C:/Users/craig/Documents/Codex/2026-11-01/parked-resolution';
const OUT=path.join(ROOT,'packet-preparation'),AUDIT=path.join(ROOT,'../parse-audit');
const SCORE='C:/Users/craig/Documents/Codex/2026-11-01/remediation/event-packet/derived-code/utils/familyFriendlyScoring.js';
const save=(n,x)=>fs.writeFileSync(path.join(OUT,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const v=d=>Object.fromEntries(Object.entries(d.fields).map(([k,x])=>[k,plain(x)]));
const ff=(fieldPath,op,value)=>({fieldFilter:{field:{fieldPath},op,value}});
function candidates(){
 const baseline=read(path.join(ROOT,'LIVE_SOURCE_BASELINE.json')),extra=read(path.join(ROOT,'ADDITIONAL_SIBLINGS.json'));
 const findings=read(path.join(ROOT,'offer-class-research/FINDINGS.json')),snaps=read(path.join(AUDIT,'snapshots.json'));
 const scorer=require(SCORE),bc=findings.decisions.find(d=>d.row===222),city=findings.decisions.find(d=>d.row===78);
 const venueDocs=baseline.sourceVenues.map(x=>x.document).filter(Boolean),venueMap=new Map(venueDocs.map(d=>[d.name.split('/documents/')[1],d]));
 const dali=baseline.sourceEvents.find(d=>d.name.includes('/slug_thedalicafe/'));
 // Dali full parent is freshly captured below; seed only the exact catalogue identity, never create/merge it.
 const catalogue=read(path.join(ROOT,'VENUE_IDENTITY_CATALOGUE.json')).documents;
 const daliIdentity=catalogue.find(d=>d.name.endsWith('/venues/slug_thedalicafe'));assert(dali&&daliIdentity);
 venueMap.set('venues/slug_thedalicafe',daliIdentity);
 const preparedUTC=baseline.atUTC,operations=[],fieldTable=[];
 const newVenueId='place_'+C.hash('ChIJGRrl28yVX0sRRvuajhcSRko').slice(0,16);
 const venue={name:'New London Carriage House',normalizedName:'new london carriage house',pagename:'New London Carriage House',pagenameNormalized:'new london carriage house',
  address:'10686 PE-6, New London, PE C0A 1M0, Canada',normalizedAddress:'10686 PE-6, New London, PE C0A 1M0, Canada',rawAddress:'10686 PE-6, New London, PE C0A 1M0, Canada',
  website:'https://carriagehousepei.com/',phone:'(902) 940-7843',googlePlaceId:'ChIJGRrl28yVX0sRRvuajhcSRko',latitude:46.464370699999996,longitude:-63.5148735,
  city:'New London',province:'PE',postalCode:'C0A 1M0',category:'event venue',addressSource:'google_places',createdAt:preparedUTC,updatedAt:preparedUTC};
 const vf=typed(venue).mapValue.fields;for(const k of ['createdAt','updatedAt'])vf[k]={timestampValue:preparedUTC};
 const galaSnap=snaps.find(s=>s.data.uniqueId==='1117142904562447');assert(galaSnap);
 operations.push({kind:'create',documentKind:'venue',path:'venues/'+newVenueId,sourceId:'1117142904562447',sourcePaths:[galaSnap.path],before:P.absent('venues/'+newVenueId),afterFields:vf});
 venueMap.set('venues/'+newVenueId,{fields:vf});
 function event(c,source,venueId,row,description,price,age,image){
  const snapshot=snaps.find(s=>s.data.uniqueId===source.sourceId);assert(snapshot);
  const parent=venueMap.get('venues/'+venueId);assert(parent);const vp=v(parent);
  const uniqueId=source.sourceId+'_'+C.hash([venueId,c.name,c.date,c.startTime]).slice(0,16),leaf='n01park_'+C.hash(uniqueId).slice(0,24),pth='venues/'+venueId+'/events/'+leaf;
  let e={uniqueId,name:c.name,eventName:c.name,eventType:row===78?'cinema':'event',description,category:row===78?'Cinema':row===134?'Gatherings & Parties':'Workshops & Classes',
   establishment:vp.name,venue:vp.name,venueId,address:vp.address,rawAddress:vp.address,normalizedAddress:vp.address,addressSource:'venue',latitude:vp.latitude,longitude:vp.longitude,
   locationScope:'venue',locationLabel:vp.name,locationPrecision:'exact',locationReviewStatus:'not_needed',mapMode:'venue',startDate:c.date,endDate:c.date,startTime:c.startTime,
   ...(c.endTime?{endTime:c.endTime}:{}),isEvent:'Yes',isFoodSpecial:'No',isRecurring:'No',recurringPattern:'none',
   timeResolution:{hoursUsed:false},timeFlags:{start:{source:'explicit',evidence:c.startTime},end:{source:c.endTime?'explicit':'none',toClose:false,evidence:c.endTime||''}},
   sourceUniqueIds:[source.sourceId],sourceUrls:[source.originalPostUrl],sourceOccurrenceCount:1,facebookUrl:source.sourcePage,cleanedFacebookUrl:source.sourcePage,
   externalLinks:c.officialEvidence,ticketLink:c.officialEvidence[0],ticketsBuyUrl:c.officialEvidence[0],...(price?{ticketPrice:price}:{}),...(age?{ageRestriction:age}:{}),
   createdAt:preparedUTC,updatedAt:preparedUTC,lastSeenAt:preparedUTC};
  if(image){Object.assign(e,{imageUrl:image,image,relevantImageUrl:image,mediaUrls:[image],imageProvenance:{version:1,primarySource:'post_media',primaryField:'relevantImageUrl',primaryUrl:image,isFallback:false,
    sourceFields:['relevantImageUrl','image','imageUrl','mediaUrls'],media:[{url:image,source:'post_media',field:'relevantImageUrl',isPrimary:true,isFallback:false}],selectionReason:'same_source_calendar_or_poster',updatedBy:'manual_source_recovery'}});}
  e.familyAudienceEvidence=scorer.bindFamilyAudienceEvidence(e,[c.name,description,age||''].join('\n'),'validated_item',source.sourceId+'|'+c.officialEvidence.join('|'));
  e=scorer.withFamilyFriendlyScore(e);const fields=typed(e).mapValue.fields;
  for(const k of ['createdAt','updatedAt','lastSeenAt'])fields[k]={timestampValue:preparedUTC};fields.sourceTimestamp={timestampValue:source.sourceTimestamp};
  operations.push({kind:'create',documentKind:'event',path:pth,sourceId:source.sourceId,sourcePaths:[snapshot.path],before:P.absent(pth),afterFields:P.canon(fields),row,
   officialEvidence:c.officialEvidence,mediaBasis:image?'Previously owned exact source media; no upload':'No owned row78 media in saved snapshot/manifest; image fields omitted. Root decision required.'});
  fieldTable.push({path:pth,row,sourceId:source.sourceId,sourceSnapshot:snapshot.path,name:e.name,date:e.startDate,start:e.startTime,end:e.endTime||null,venueId,price:e.ticketPrice||null,age:e.ageRestriction||null,
   image:image||null,familyScore:e.familyFriendlyScore,familyLevel:e.familyFriendlyLevel,officialEvidence:c.officialEvidence,description,allAfterFields:P.canon(fields)});
 }
 for(const c of city.recoveredCandidates.filter(c=>c.date>='2026-11-03'))event(c,city.source,'slug_citycinemachtown',78,'Helen Mirren portrays Patricia Highsmith in A Talent for Murder, a literary thriller inspired by the writer of the Ripley books.',null,null,null);
 const calendar='https://storage.googleapis.com/gathr-uploaded-images/postimages/1793542457778-8ckmha.webp';
 const byDate=d=>clone(bc.recoveredCandidates.find(c=>c.date===d));
 event(byDate('2026-11-15'),bc.source,'name_6387om',222,'Beginner cross stitch workshop for children ages 7–13 at Blank Canvas Art Supplies. Supplies included. Register in advance.','$30 CAD','Ages 7–13',calendar);
 for(const [i,date] of ['2026-11-18','2026-11-25','2026-12-02'].entries()){const c=byDate('2026-11-18');c.date=date;event(c,bc.source,'name_6387om',222,`Intermediate lino printmaking course, session ${i+1} of 3. Course dates: November 18, November 25 and December 2. Registration is for the complete course; the $110 fee covers all three classes. After-hours entry is through the Holman Grand lobby.`,'$110 CAD for the complete three-class course',null,calendar);}
 event(byDate('2026-11-22'),bc.source,'name_6387om',222,'Make a winter cross stitch project at Blank Canvas Art Supplies. Register in advance.','$30 CAD',null,calendar);
 event(byDate('2026-11-29'),bc.source,'name_6387om',222,'Create winter decor with needle felting at Blank Canvas Art Supplies. Register in advance.','$30 CAD',null,calendar);
 for(const [i,date] of ['2026-11-14','2026-11-21','2026-11-28','2026-12-05'].entries()){const c=byDate('2026-11-28');c.date=date;event(c,bc.source,'name_6387om',222,`Adults beginner acrylics: Seeing the Light, session ${i+1} of 4. Course dates: November 14, November 21, November 28 and December 5. Registration is for the complete course; the $145 fee covers all four classes.`,'$145 CAD for the complete four-class course','Adults',calendar);}
 event(byDate('2026-11-24'),bc.source,'slug_thedalicafe',222,'Cocktails & Crafts: make Holiday/Christmas Cards at The Salvador Dali Café, 155 Kent Street. Instruction begins at 6:30 pm. Ages 19+. Food and drinks may be purchased before class. Register in advance.','$25 + HST','19+',calendar);
 const galaSource={sourceId:'1117142904562447',sourcePage:'https://www.facebook.com/KeyMurrayLaw',originalPostUrl:'https://www.facebook.com/KeyMurrayLaw/posts/pfbid0GE4be8B6Pm3qAtiPh6yYLk7nbvvj8hjv6TtH6HDcj4eH6ydjQtoAZF3Ad3h7F4gCl',sourceTimestamp:'2026-10-31T23:39:50.000Z'};
 event({name:'KACC Business of Excellence Awards Gala & Christmas Social',date:'2026-11-26',startTime:'18:30',endTime:null,officialEvidence:['https://locarius.io/events/5148/kacc-business-of-excellence-awards-gala-2026','https://www.kaccpei.com/business-awards']},galaSource,newVenueId,134,
  'Join the Kensington & Area Chamber of Commerce for its 20th annual Business Awards Gala & Christmas Social at New London Carriage House, 10686 PE-6, New London. Tickets are available through the organizer.','From $85.26',null,'https://storage.googleapis.com/gathr-uploaded-images/postimages/1793541539553-0s1xew.webp');
 for(const o of operations)o.archivePath='event_integrity_backups/n01park_'+C.hash(o.path).slice(0,24);
 assert.equal(operations.length,18);return{preparedUTC,operations,fieldTable,baseline,extra,snapshots:snaps.filter(s=>[78,134,222].includes(s.data.rowIndex))};
}
function requestPacket(){
 const x=candidates(),{operations}=x,events=operations.filter(o=>o.documentKind==='event');
 const requiredAbsent=[...operations.flatMap(o=>[o.path,o.archivePath]),...events.map(o=>'events/'+o.path.split('/').at(-1))];
 const refForms=[...new Set(events.flatMap(o=>{const e=v({fields:o.afterFields}),id=o.path.split('/').at(-1),date=e.startDate.replaceAll('-','');return[id,e.uniqueId,o.path,...[id,e.uniqueId,o.path].map(x=>'fb_'+x),id+'_'+date,'fb_'+id+'_'+date];}))];
 const counters=[...new Set(refForms.filter(x=>!x.includes('/')).flatMap(id=>['eventLikes','eventShares','eventUsersResponded'].map(c=>c+'/'+id)))];
 requiredAbsent.push(...counters);
 const protectedDocs=[...x.baseline.sourceEvents,...x.baseline.relatedEvents.flatMap(q=>q.documents),...x.extra.innEvents,...x.extra.blankCanvasLegacy].map(d=>d.document||d).filter(d=>d.name).map(d=>d.name.split('/documents/')[1]);
 const parents=[...new Set([...events.map(o=>o.path.split('/events/')[0]),'venues/slug_blankcanvasartsupplies','venues/slug_newlondoncommunitycomplex','venues/slug_sourisshowhall',...protectedDocs.filter(p=>p.includes('/events/')).map(p=>p.split('/events/')[0])])];
 const queries=parents.map(parent=>({label:'Full protected parent siblings '+parent,kind:'siblings',collection:'events',parent,limit:1001}));
 queries.push({label:'Cross-parent event identities',kind:'globalEvents',collection:'events',allDescendants:true,select:{fields:['name','eventName','venueId','uniqueId','sourceUniqueId','sourceUniqueIds','startDate','endDate','startTime','endTime','isRecurring','recurringPattern','recurrenceUntilDate'].map(fieldPath=>({fieldPath}))},limit:5001});
 queries.push({label:'Venue identity catalogue',kind:'catalogue',collection:'venues',select:{fields:['name','normalizedName','address','website','googlePlaceId','placeId','latitude','longitude'].map(fieldPath=>({fieldPath}))},limit:1501});
 for(const sourceId of ['1667519308718317','1070271196035284','1117142904562447'])for(const [f,op]of [['sourceUniqueIds','ARRAY_CONTAINS'],['sourceUniqueId','EQUAL']])queries.push({label:'Source lineage '+sourceId+' '+f,kind:'source',collection:'events',allDescendants:true,filter:ff(f,op,{stringValue:sourceId}),limit:501});
 for(const o of events)queries.push({label:'Exact occurrence '+plain(o.afterFields.uniqueId),kind:'exact',mustBeEmpty:true,collection:'events',allDescendants:true,filter:ff('uniqueId','EQUAL',o.afterFields.uniqueId),limit:101});
 for(let i=0;i<refForms.length;i+=30)for(const field of ['savedEvents','likedEvents','interestedEvents','favorites'])queries.push({label:'Known reference '+field+' '+i,kind:'reference',mustBeEmpty:true,collection:'users',select:{fields:[{fieldPath:field}]},filter:ff(field,'ARRAY_CONTAINS_ANY',{arrayValue:{values:refForms.slice(i,i+30).map(stringValue=>({stringValue}))}}),limit:101});
 const documents=[...new Set([...parents,...protectedDocs,...x.snapshots.map(s=>s.path),'unrecognized_venues/uv_98822dff350b2154a4b316df',C.FEED,...requiredAbsent])];
 const r={schemaVersion:1,ownerTaskId:OWNER,preparedUTC:x.preparedUTC,operations,fieldTable:x.fieldTable,documents,requiredAbsent:[...new Set(requiredAbsent)],queries,childPaths:operations.map(o=>o.path),productionWrites:0};return P.seal(r);
}
function assertNoDuplicate(r,s){
 const norm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const all=s.queries.find(q=>q.query.kind==='globalEvents');assert(all,'Complete event identity inventory missing');
 for(const o of r.operations.filter(o=>o.documentKind==='event')){const a=v({fields:o.afterFields});for(const d of all.documents){const b=v(d);assert(!(b.uniqueId===a.uniqueId||b.venueId===a.venueId&&b.startDate===a.startDate&&b.startTime===a.startTime&&norm(b.name||b.eventName)===norm(a.name)),'Duplicate occurrence already exists '+d.path);}}
 const venues=s.queries.find(q=>q.query.kind==='catalogue');assert(venues);for(const d of venues.documents){const a=v(d);assert(!(a.googlePlaceId==='ChIJGRrl28yVX0sRRvuajhcSRko'||norm(a.name)==='newlondoncarriagehouse'),'Canonical gala venue already exists '+d.path);}
}
function makePlan(r,s){
 C.verifyDigest(r);assert.deepEqual(r,requestPacket(),'Candidate/source request drift');assertNoDuplicate(r,s);
 assert.equal(s.requestDigest,r.digest);assert.deepEqual(s.documents.map(d=>d.path).sort(),[...r.documents].sort());
 const docs=P.index(s.documents);for(const p of r.requiredAbsent)assert.equal(docs.get(p)?.exists,false,'Required new/reference path already exists '+p);
 const x=candidates();for(const raw of [...x.baseline.sourceEvents,...x.baseline.relatedEvents.flatMap(q=>q.documents),...x.extra.innEvents,...x.extra.blankCanvasLegacy]){
  const expected=C.wrap({found:raw});assert.deepEqual(P.nativeSignature([docs.get(expected.path)]),P.nativeSignature([expected]),'Reviewed root baseline drift '+expected.path);
 }
 // The three supplied plain audit snapshots match fresh native field values
 // exactly (including timestamps); no precision relaxation is used here.
 for(const sn of x.snapshots)assert.deepEqual(v(docs.get(sn.path)),sn.data,'Reviewed source snapshot drift '+sn.path);
 const authorityFile=path.join(ROOT,'ACTUAL_USER_AUTHORITY.json'),authority=read(authorityFile);
 const findings=read(path.join(ROOT,'offer-class-research/FINDINGS.json'));
 const researchFiles=[...new Set(findings.decisions.filter(d=>[78,222].includes(d.row)).flatMap(d=>d.research.scrapes).map(f=>'offer-class-research/'+f))];
 const evidence=['ACTUAL_USER_AUTHORITY.json','LIVE_SOURCE_BASELINE.json','ADDITIONAL_SIBLINGS.json','VENUE_IDENTITY_CATALOGUE.json','EXACT_ADDITIONAL_VENUES.json','gala-official-directions.json','offer-class-research/FINDINGS.json','offer-class-research/RESEARCH_SUMMARY.md','clock-venue-research/FINDINGS.json','clock-venue-research/WEB_RESEARCH_RAW.json',...researchFiles];
 const files=[...evidence.map(f=>path.join(ROOT,f)),path.join(AUDIT,'snapshots.json'),path.join(AUDIT,'media-manifest.json'),path.join(AUDIT,'media/222-stored-0.img'),path.join(AUDIT,'media/134-stored-0.img'),path.join(OUT,'REQUEST.json'),path.join(OUT,'GUARD_CAPTURE.json'),__filename,require.resolve('./parked-create.cjs'),require.resolve('./parked-create-runner.cjs'),require.resolve('./combined.cjs'),require.resolve('./combined-runner.cjs'),C.CORE_FILE,require.resolve('../recover-oct28-roundup-movie.cjs'),SCORE,path.resolve(path.dirname(SCORE),'../services/familyAudienceEvidence.js'),path.resolve(__dirname,'../../functions/src/utils/familyFriendlyScoring.ts'),path.resolve(__dirname,'../../functions/src/services/familyAudienceEvidence.ts')];
 const scopeDigest=C.hash({requestDigest:r.digest,authoritySHA256:C.fileHash(authorityFile)});
 const p=P.seal({schemaVersion:1,kind:'NOV01_PARKED_CREATE_ONLY',mode:'OFFLINE_PREPARATION_ONLY',ownerTaskId:OWNER,preparedUTC:r.preparedUTC,activationAllowed:false,
  authority,authorityEvidence:{path:authorityFile,sha256:C.fileHash(authorityFile)},scopeDigest,requestDigest:r.digest,operations:r.operations,
  documents:s.documents,queries:s.queries,childPaths:r.childPaths,requiredAbsent:r.requiredAbsent,feedVersion:C.feedVersion(docs.get(C.FEED)),
  parserFunctions:s.parserFunctions,counts:{newEvents:17,newVenues:1,archives:18,feedIncrements:1,forward:37,recovery:19,eventUpdates:0,deletes:0},
  boundFiles:Object.fromEntries(files.map(f=>[path.resolve(f),C.fileHash(f)])),independentReview:{status:'PENDING',approved:false,evidence:null},
  gaps:['Root independent review, exact authority-to-target binding, parent execution and ledger activation/reservations missing; no apply transport in this task.',
   'Five City Cinema candidates have no owned original-source GCS image in the supplied snapshot/manifest. They intentionally omit image fields. Root must decide on image-less publication or separately authorize exact-source staging.',
   'Gala same-entity point must receive independent acceptance: Places geometry used; official marker is about56m away and website printed point about277m away. No averaging.',
   'Read-only capture is a dated observation; recheck every native/source/sibling/reference/child/feed/runtime/parser guard immediately before a future authorized transaction.',
   'Public detail/venue-list/feed verification and recovery child/reference inventory require root orchestration.'],productionWrites:0});
 P.verify(p);P.checkSnapshot(p,s);return p;
}
if(require.main===module){fs.mkdirSync(OUT,{recursive:true});const mode=process.argv[2]||'offline';assert(['offline','--freeze'].includes(mode));if(mode==='offline'){const r=requestPacket();save('REQUEST.json',r);save('SOURCE_TO_AFTER_FIELDS.json',r.fieldTable);console.log(JSON.stringify({status:'OFFLINE_REQUEST_PREPARED',requestDigest:r.digest,newEvents:17,newVenues:1,queries:r.queries.length,documents:r.documents.length,productionWrites:0}));}else{const p=makePlan(read(path.join(OUT,'REQUEST.json')),read(path.join(OUT,'GUARD_CAPTURE.json')));save('OPERATIONAL_PLAN.json',p);save('NATIVE_WRITE_PREVIEW.json',P.forwardWrites(p,P.index(p.documents).get(C.FEED)));save('NATIVE_BEFORE_BACKUP.json',{requestDigest:p.requestDigest,documents:p.documents,operations:p.operations.map(o=>({path:o.path,before:o.before,archivePath:o.archivePath,restore:{kind:'delete_new_at_receipt_updateTime',mask:[]}})),productionWrites:0});console.log(JSON.stringify({status:'FROZEN_OFFLINE',digest:p.digest,counts:p.counts,productionWrites:0}));}}
module.exports={ROOT,OUT,AUDIT,SCORE,save,v,ff,candidates,requestPacket,assertNoDuplicate,makePlan};
