import {festivalShadowFingerprint} from './festivalLinkShadowJob.js';
import type {FestivalEdition} from './festivalLinker.js';
export interface ReviewedFestivalEdition extends FestivalEdition {
 sourceBindings:Record<string,{organizerId:string;sourceUrl:string;authority:string}>;
 venueAliases:Record<string,string[]>;
 authority:{kind:'reviewed_edition';reviewPath:string;eventPath:string};
}
/** Public wording or coordinates alone never register an edition. */
export function reviewedFestivalEdition(event:{path:string;data:Record<string,any>},review:{path:string;data:Record<string,any>},asOf:string):ReviewedFestivalEdition|undefined{
 const e=event.data,r=review.data;
 if(event.path!==`events/${event.path.split('/')[1]}`||e.locationScope!=='area'||!e.startDate||!e.endDate||e.endDate<asOf||
  !e.areaData?.locations?.length||!e.cityLevelReviewId||!/^20\d{2}-\d{2}-\d{2}$/.test(e.startDate)||e.startDate.slice(0,4)!==e.endDate.slice(0,4)||
  review.path!==`city_level_event_reviews/${e.cityLevelReviewId}`||r.status!=='published'||r.publishedEventPath!==event.path||r.finalization?.action!=='approve_publish'||!r.finalization?.manual?.areaData)return;
 let name=String(e.eventName||'').replace(/\s+20\d{2}\s*$/,'').trim();if(!/\b(?:fest|festival|week)\b/i.test(name))return;
 const reviewedName=(r.areaEventLinks||[]).map((p:any)=>p.festivalName).find((n:any)=>String(n||'').toLowerCase()===name.toLowerCase());if(reviewedName)name=reviewedName;
 const organizerId='edition_authority_'+festivalShadowFingerprint({review:review.path,name}).slice(0,24),sourceBindings:ReviewedFestivalEdition['sourceBindings']={};
 let official:URL|undefined;try{official=new URL(e.areaData.sourceUrl);}catch{}
 for(const proof of r.areaEventLinks||[]){let url:URL;try{url=new URL(proof.sourceUrl);}catch{continue;}
  if(!official||url.origin!==official.origin||!url.pathname.replace(/\//g,''))continue;
  const id=url.toString();sourceBindings[id]={organizerId,sourceUrl:id,authority:review.path};
 }
 return {id:event.path.split('/')[1],name,year:Number(e.startDate.slice(0,4)),startDate:e.startDate,endDate:e.endDate,organizerId,organizerNames:[name],sourceIds:Object.keys(sourceBindings).sort(),sourceBindings,
  venueIds:[...new Set<string>(e.areaData.locations.filter((p:any)=>p.certainty==='confirmed'&&p.venueId).map((p:any)=>p.venueId))].sort(),
  venueAliases:Object.fromEntries(e.areaData.locations.filter((p:any)=>p.certainty==='confirmed'&&p.venueId).map((p:any)=>[p.venueId,[...new Set([p.label,...(r.areaEventLinks||[]).filter((x:any)=>x.venueId===p.venueId).map((x:any)=>x.sourceVenueText)])].filter(Boolean).sort()])),
  occurrenceAuthorities:(r.areaEventLinks||[]).filter((p:any)=>Object.keys(sourceBindings).includes(p.sourceUrl)),authority:{kind:'reviewed_edition',eventPath:event.path,reviewPath:review.path}};
}
