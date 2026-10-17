/** Offline payload construction using the released parser; never writes Firestore. */
import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY='offline-payload-preview-not-a-key';
globalThis.fetch=async()=>{throw new Error('Offline payload preview forbids network/model requests');};
const require=createRequire(new URL('../functions/artifacts/oct17-eight-group-release/parser-release/package.json',import.meta.url));
const {previewFullParserEventWritePayload,createFullParserVenueLookupCache}=require('./lib/processing/rowProcessor.js');
const {normalizeVenueName}=require('./lib/utils/similarity.js');const {normalizeCanadianAddress}=require('./lib/utils/addressNormalization.js');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const task=new URL('./artifacts/oct17-remaining-followups/venue-evidence/',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const [proposal,ledger,raw,points]=await Promise.all([read(task+'reviewed-recovery-proposal.json'),read(task+'source-ledger.json'),read(task+'original-rows.json'),read(new URL('./artifacts/oct17-remaining-followups/venue-points-readonly.json',import.meta.url))]);
const approvedKeys=['no-frills-charlottetown','haunted-mansion-kensington','summerside-butcher-shop','browns-volkswagen','hbm-summerside','sobeys-stratford'];
assert.equal(points.actualLookups,8);assert(points.complete);
const operations=[],sources=[],manifest=[];
for(const key of approvedKeys){
 const candidate=proposal.venueCandidates.find(c=>c.key===key),recovery=proposal.recoveryCandidates.find(r=>r.venueCandidateKey===key);assert(candidate&&recovery);
 const response=points.results.find(p=>p.candidateKey===key);assert.equal(response.status,200);assert.equal(response.places.length,1);
 const place=response.places[0];
 if(key==='haunted-mansion-kensington'){
  assert.equal(place.businessStatus,'CLOSED_TEMPORARILY');
  const owner=await fs.readFile(new URL('./artifacts/oct17-remaining-followups/haunted-owner-20261017.html',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(owner).digest('hex'),'b0dc705bfd78d93961293d63781601e68de5c0902b565673c9cd252e95a8c18f');
  assert(owner.includes('Starting October 16th, 2026')&&owner.includes('22nd'));
  // Preserve Google's actual status as provider metadata. The owner's explicit
  // dated season schedule and original campaign invitation support this visit;
  // no attraction admission or ordinary operating-hours promise is added.
 }else assert.equal(place.businessStatus,'OPERATIONAL');
 assert(place.types.includes('establishment'));assert(place.location.latitude>45&&place.location.latitude<47&&place.location.longitude>-65&&place.location.longitude<-61);
 const streetNumber=candidate.address.match(/^\d+/)?.[0];assert(streetNumber&&place.formattedAddress.startsWith(streetNumber+' '));assert(place.formattedAddress.includes(candidate.city));
 // Brown's owner and Places disagree on postal code. Preserve the agreed street,
 // city/province and verified point without selecting either conflicting postal.
 const address=normalizeCanadianAddress(key==='browns-volkswagen'?`${candidate.address}, ${candidate.city}, PE, Canada`:place.formattedAddress);
 const venueId='place_'+hash(place.id).slice(0,16),venue={id:venueId,name:candidate.name,pagename:candidate.name,normalizedName:normalizeVenueName(candidate.name),
  aliases:candidate.aliases,aliasesNormalized:candidate.aliases.map(normalizeVenueName),address:address.normalizedAddress,rawAddress:address.rawAddress,normalizedAddress:address.normalizedAddress,addressSource:'manual',addressNormalizationIssues:address.issues,
  city:candidate.city,province:'PE',latitude:place.location.latitude,longitude:place.location.longitude,googlePlaceId:place.id,googlePlaceTypes:place.types,googleBusinessStatus:place.businessStatus};
 const source=ledger.find(s=>s.source===recovery.sourceUniqueId),original=raw.find(r=>String(r.postId)===source.source);assert(source&&original);
 const item=structuredClone(source.events.find(e=>e.startDate===recovery.facts.startDate));assert(item);
 assert.equal(item.startTime,recovery.facts.startTime);assert.equal(item.endTime,recovery.facts.endTime);
 if(key==='sobeys-stratford')Object.assign(item,{isRecurring:'No',recurringPattern:'none',description:recovery.facts.description});
 assert.equal(item.recurringPattern,'none');
 const row={uniqueId:source.source,facebookUrl:original.facebookUrl,sourceScraperType:'posts',userName:source.rowMeta.userName,pageName:source.rowMeta.pageName,
  text:source.inputText,timestamp:source.rowMeta.timestamp,topLevelUrl:original.url,mediaUrls:source.rowMeta.mediaUrls,externalLinks:[],likes:Number(original.likes||0),shares:Number(original.shares||0),comments:Number(original.comments||0),topReactionsCount:Number(original.topReactionsCount||0)};
 const allowed=new Set([candidate.name,...candidate.aliases,item.establishment,item.additionalLocation].filter(Boolean).map(normalizeVenueName));
 const cache=createFullParserVenueLookupCache(async name=>{assert(allowed.has(normalizeVenueName(name)),'Unexpected venue lookup '+name);return {isMatch:true,matchType:'exact',similarity:1,matchedVenue:venue};},async()=>{throw new Error('Unexpected address fallback');});
 const payload=await previewFullParserEventWritePayload(item,row,source.row,0,null,row.userName,cache);
 assert.equal(payload.venueId,venueId);assert.equal(payload.locationScope,'venue');assert.equal(payload.locationPrecision,'exact');assert.equal(payload.startDate,recovery.facts.startDate);
 assert.equal(payload.endDate,recovery.facts.endDate);assert.equal(payload.startTime,recovery.facts.startTime);assert.equal(payload.endTime,recovery.facts.endTime);assert.equal(payload.recurringPattern,'none');
 assert(!payload.isRecurring||payload.isRecurring==='No');assert.equal(payload.sourceUniqueIds[0],source.source);assert.equal(payload.imageUrl,recovery.facts.imageUrl);
 assert(!String(payload.description).includes('Review reasons:'));
 const clean=JSON.parse(JSON.stringify(payload));for(const field of ['usersGoing','usersInterested','usersResponded','facebookUsersResponded'])delete clean[field];
 const sourceMillis=Date.parse(row.timestamp);assert(Number.isFinite(sourceMillis));
 clean.sourceTimestamp={_seconds:Math.floor(sourceMillis/1000),_nanoseconds:(sourceMillis%1000)*1000000};
 delete clean.addressUpdatedAt;
 clean.sourceUrls=[...new Set([...clean.sourceUrls,...recovery.facts.sourceUrls,source.rowMeta.sharedPostUrl].filter(Boolean))];
 const eventId='oct17_recovery_'+hash(clean.uniqueId).slice(0,20),eventPath=`venues/${venueId}/events/${eventId}`;
 const venuePayload={...venue};delete venuePayload.id;
 operations.push({action:'create',path:'venues/'+venueId,payload:venuePayload,timestampFields:['createdAt','updatedAt','addressUpdatedAt']},{action:'create',path:eventPath,payload:clean,timestampFields:['createdAt','updatedAt','lastSeenAt','addressUpdatedAt']});
 sources.push({path:recovery.reviewPath,expectedDataHash:recovery.expectedReviewDataHash},{path:recovery.sourceSnapshotPath});
 manifest.push({key,venuePath:'venues/'+venueId,eventPath,name:clean.name,date:clean.startDate,start:clean.startTime,end:clean.endTime,sourceUniqueId:source.source,sourceUrls:clean.sourceUrls,originalSharedPostUrl:source.rowMeta.sharedPostUrl||null,ownerEvidenceUrl:candidate.sourceUrl,googlePlaceId:place.id});
}
assert.equal(operations.length,12);assert.equal(new Set(operations.map(o=>o.path)).size,12);
const result={version:1,status:'offline_payloads_ready_requires_live_preflight_and_exact_scope_review',runtimeParserHash:'0c06b198eacb9cf32171e0d68fbea89e889a93c3',manifest,operations,sources,
 holds:['Kays joint-site representation and attendee entrance unresolved','Coats distribution attendance venue unstated','Moth Lane historical clock conflict'],liveWrites:0,modelCalls:0,rowReplays:0};
await fs.writeFile(new URL('./artifacts/oct17-remaining-followups/donation-recovery-offline-plan.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({venues:6,events:6,manifest,liveWrites:0,modelCalls:0,rowReplays:0}));
