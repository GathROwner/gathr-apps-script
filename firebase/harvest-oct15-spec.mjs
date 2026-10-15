// Reviewed programme only. Pure plan construction; no credentials/network/writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const venuePath='venues/fb_100063617721610';
export const sourceId='1727757279354846';
export const sourcePath='parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_201_1792070012802';
export const feedPath='runtime_metadata/event_feed';
export const website='https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/';
export const faq='https://innatbayfortune.com/faqs-2/';
export const poster='https://storage.googleapis.com/gathr-uploaded-images/postimages/1792069908955-ld90tm.webp';
export const keepers=['L5dAjm7VnQOOCMMze25W','dQu2rri6uhLZ26JCE3bV','e24xrgAQkIvU8fzXRcKD'];
export const retired=[
 ['Dyji8HO9xPPeK7NHqLxZ','1684384400358801_53e44ee886327426','Experimental Workshop (Chefs’ Harvest Dining Series)','2026-10-16'],
 ['UBEBhqRCWGZiOcxcx1Ut','1697135625750345_6395fbd39a642f4c','Chefs’ Harvest Weekends (4 exclusive weekends)','2026-10-15'],
 ['USWHrsFHSqiYEEwysdue','1687493253381249_9a6ce81ca04528e3','Chefs’ Harvest Dining Series','2026-09-13'],
 ['WxmxNCWEA4QmC5rkrezM','1659097636220811_7292e09e1d3023d9',"Chefs’ Harvest (Chefs' Harvest returns this fall)",'2026-10-15'],
 ['j8zJSMk065zZvbIbd1d4','1699996128797628_58744613c639e3b5','Exclusive Culinary Weekends (Fall series)','2026-10-15']
];
export const dates=['2026-10-15','2026-10-16','2026-10-17','2026-10-22','2026-10-23','2026-10-24','2026-10-29','2026-10-30','2026-10-31','2026-11-05','2026-11-06','2026-11-07'];
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
export function storedIdentity(root,e,venueName=e.establishment,additionalLocation=e.additionalLocation){
 const facts={schema:'expanded_event_v2',eventName:norm(e.eventName||e.name),startDate:norm(e.startDate),endDate:norm(e.endDate),startTime:norm(e.startTime),endTime:norm(e.endTime),venueName:norm(venueName),additionalLocation:norm(additionalLocation)};
 return root+'_'+createHash('sha1').update(JSON.stringify(facts)).digest('hex').slice(0,16);
}
export const eventPath=id=>venuePath+'/events/'+id;
export function buildChanges(documents){
 const byPath=new Map(documents.map(d=>[d.path,d.data])),venue=byPath.get(venuePath),source=byPath.get(sourcePath),base=byPath.get(eventPath(keepers[0]));
 assert(venue&&source&&base);assert.equal(source.uniqueId,sourceId);assert.equal(source.rowIndex,201);
 assert.equal(venue.name,'The Inn at Bay Fortune | Souris PE');assert.equal(base.startTime,'17:00');assert.equal(base.endTime,'21:30');
 assert(!venue.reviewedOccurrenceRetirements,'Existing retirement policy needs separate review');
 const items=source.stages[0].output.stageArtifacts.stage3Items;assert.equal(items.length,10);
 const future=items.filter(i=>i.date!=='2026-10-15');assert.deepEqual(future.map(i=>i.date),dates.slice(3));
 assert(future.every(i=>i.relevantImageIndex===4&&i.recurringPattern==='none'));
 const retiredIds=[];
 for(const [id,uid,title,date] of retired){const old=byPath.get(eventPath(id));assert(old);assert.equal(old.uniqueId,uid);assert.equal(old.eventName,title);assert.equal(old.startDate,date);
  // Legacy stored IDs plus current v2 identities for these exact historical facts.
  // Source and occurrence facts stay exact; this is not a post-wide exclusion.
  retiredIds.push(uid,storedIdentity(uid.split('_')[0],old),storedIdentity(uid.split('_')[0],old,venue.name,''));
 }
 const retirementPolicy={version:1,kind:'reviewed_duplicate_cleanup',reviewId:'harvest-twelve-printed-evenings-20261015',canonicalEventPath:eventPath(keepers[0]),
  sourceUniqueIds:[...new Set(retired.map(r=>r[1].split('_')[0]))],retiredUniqueIds:[...new Set(retiredIds)].sort()};
 const changes=[];
 for(let index=0;index<dates.length;index++){
  const date=dates[index],old=index<3?byPath.get(eventPath(keepers[index])):null;
  if(old)assert.equal(old.startDate,date);
  const item=index<3?items[0]:future[index-3];
  const name=item.name,theme=index<3?'A foraging-inspired seven-course menu with Nick of North.':index<6?'South American flavours with Head Chef Matt Pigeon.':index<9?'An Italian-inspired menu with Sous Chef Mackenzie Brown.':"Chef Michael Smith revisits his 1990s Inn Chef menus.";
  const media=[...new Set([...(old?.mediaUrls||base.mediaUrls||[]),poster])];
  const provenance={version:1,primarySource:'post_media',primaryField:'relevantImageUrl',primaryUrl:poster,isFallback:false,
   sourceFields:['relevantImageUrl','image','imageUrl','mediaUrls','icon'],
   media:[...['relevantImageUrl','image','imageUrl'].map(field=>({url:poster,source:'post_media',field,isPrimary:field==='relevantImageUrl',isFallback:false})),
    ...media.map(url=>({url,source:'post_media',field:'mediaUrls',isPrimary:false,isFallback:false})),{url:venue.profileImage,source:'profile_image',field:'icon',isPrimary:false,isFallback:true}],
   selectionReason:'source_verified_printed_harvest_programme',updatedBy:'manual_repair'};
  const evidence=`venue_website:${website} | Named dining series 5:00–9:30 PM; ${date}; lodging check-in and following-morning guest programme are separate`;
  const patch={name,eventName:name,description:`${theme} Chefs’ Harvest at The Inn at Bay Fortune brings together chef conversations, an experimental reception, a seven-course tasting menu and the Fire Bar. The evening programme runs from 5 to 9:30 p.m. on this advertised date. Dining is $305 plus tax per person, including service. Overnight accommodation is booked separately; breakfast and the following morning's foraging adventure are for house guests. Reservations are required and availability is limited.`,
   startDate:date,endDate:date,startTime:'17:00',endTime:'21:30',isRecurring:'No',recurringPattern:'none',recurrenceUntilDate:'',totalOccurrences:1,recurringDaysOfWeek:[],recurringWeekdaySequence:[],recurringWeekInterval:1,sourceOccurrenceCount:12,
   price:'$305 plus tax per person',ticketPrice:'$305 plus tax per person',ticketLink:website,ticketsBuyUrl:website,
   externalLinks:[...new Set([...(old?.externalLinks||[]),website])],
   sourceUniqueIds:[...new Set([...(old?.sourceUniqueIds||[]),...(old?.uniqueId?[old.uniqueId.split('_')[0]]:[]),sourceId])],
   sourceUrls:[...new Set([...(old?.sourceUrls||[]),source.facebookUrl,website])],
   image:poster,imageUrl:poster,relevantImageUrl:poster,mediaUrls:media,imageProvenance:provenance,
   timeFlags:{start:{source:'explicit',evidence},end:{source:'explicit',toClose:false,evidence}},timeResolution:{hoursUsed:false,reason:'source_verified_named_series_clock',sourceUrl:website}};
  if(old)changes.push({path:eventPath(keepers[index]),kind:'update',patch});
  else{
   // Copy only established venue/category fields, never another occurrence's social counts or timestamps.
   const fields=['establishment','locationScope','locationLabel','locationPrecision','locationReviewStatus','eventType','category','isEvent','isFoodSpecial','facebookUrl','cleanedFacebookUrl','address','rawAddress','normalizedAddress','addressSource','addressNormalizationIssues','icon','latitude','longitude','sourceTimestamp'];
   const payload={...Object.fromEntries(fields.filter(k=>k in base).map(k=>[k,base[k]])),...patch,venueId:venuePath.split('/')[1],_sourceType:'event',recoveryRun:'harvest-reviewed-programme-20261015'};
   payload.uniqueId=storedIdentity(sourceId,payload,venue.name,'');
   changes.push({path:eventPath('harvest_20261015_'+date.replaceAll('-','')+'_1700'),kind:'create',payload});
  }
 }
 changes.push(...retired.map(([id])=>({path:eventPath(id),kind:'delete'})),{path:venuePath,kind:'update',patch:{reviewedOccurrenceRetirements:retirementPolicy}});
 assert.equal(changes.length,18);assert.equal(changes.filter(c=>c.kind==='create').length,9);assert.equal(changes.filter(c=>c.kind==='delete').length,5);
 return changes;
}
