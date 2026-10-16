/** Add-only machine publication. Human links/points/timing and private review remain owned by humans. */
import {resolveFestivalMembership} from './festivalLinker.js';
import type {FestivalEdition,FestivalSourceEvidence,FestivalCanonicalRecord,FestivalCanonicalVenue,FestivalLinkResult} from './festivalLinker.js';
import {festivalShadowFingerprint,verifyFestivalFullRun} from './festivalLinkShadowJob.js';
import type {FullRunEvidence,FestivalShadowJob} from './festivalLinkShadowJob.js';
import type {EventAreaData} from './areaEventPublication.js';
import {validateEventAreaData} from './areaEventPublication.js';

export const FESTIVAL_PUBLICATION_POLICY='source-verified-additions-v1';
export interface FestivalPublicationOwnership {
 version:1; umbrellaPath:string; policy:string; machineLinks:{eventId:string;venueId:string;fingerprint:string}[];
 /** A human removal of a machine link is sticky; a later replay cannot restore it. */
 suppressedEventIds:string[];
}
export interface FestivalPublicationInput {
 edition:FestivalEdition; umbrella:{path:string;data:Record<string,any>}; review:{path:string;data:Record<string,any>};
 sources:readonly FestivalSourceEvidence[]; candidates:readonly FestivalCanonicalRecord[]; venues:readonly FestivalCanonicalVenue[];
 completion:FullRunEvidence; sourceInventoryComplete:boolean; ownership?:FestivalPublicationOwnership;
}
export async function planFestivalLinkPublication(input:FestivalPublicationInput):Promise<{
 status:'held'|'ready';reason:string;result?:FestivalLinkResult;areaData?:EventAreaData;ownership?:FestivalPublicationOwnership;addedEventIds:string[];
}>{
 const hold=(reason:string)=>({status:'held' as const,reason,addedEventIds:[]});
 const gate=verifyFestivalFullRun(input.completion);if(!gate.ready)return hold(gate.reason);
 if(!input.sourceInventoryComplete)return hold('source_inventory_incomplete');
 const e=input.umbrella.data,r=input.review.data;
 if(input.umbrella.path!==`events/${input.edition.id}`||e.locationScope!=='area'||e.cityLevelReviewId!==input.review.path.split('/')[1]||
  input.review.path!==`city_level_event_reviews/${e.cityLevelReviewId}`||r.status!=='published'||r.publishedEventPath!==input.umbrella.path||
  r.finalization?.action!=='approve_publish'||!r.finalization?.manual?.areaData||e.startDate!==input.edition.startDate||e.endDate!==input.edition.endDate)
  return hold('reviewed_edition_authority_changed');
 let areaData:EventAreaData;try{areaData=structuredClone(validateEventAreaData(e.areaData));}catch{return hold('invalid_umbrella_points');}
 const existing=input.ownership;
 const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
 if(existing&&(existing.version!==1||existing.umbrellaPath!==input.umbrella.path||existing.policy!==FESTIVAL_PUBLICATION_POLICY||
  !Array.isArray(existing.machineLinks)||!Array.isArray(existing.suppressedEventIds)||existing.machineLinks.length>500||existing.suppressedEventIds.length>500||
  !existing.machineLinks.every(p=>p&&identifier(p.eventId)&&identifier(p.venueId)&&/^[a-f0-9]{64}$/.test(p.fingerprint))||
  new Set(existing.machineLinks.map(p=>p.eventId)).size!==existing.machineLinks.length||!existing.suppressedEventIds.every(identifier)))return hold('invalid_publication_ownership');
 const locations=areaData.locations,currentIds=new Set(locations.flatMap(p=>p.linkedEventIds||[]));
 const suppressed=new Set(existing?.suppressedEventIds||[]);
 for(const old of existing?.machineLinks||[])if(!currentIds.has(old.eventId))suppressed.add(old.eventId);
 const result=await resolveFestivalMembership({umbrella:input.edition,sources:input.sources,candidates:input.candidates,venues:input.venues});
 const owned=new Map((existing?.machineLinks||[]).map(p=>[p.eventId,p]));const addedEventIds:string[]=[];
 for(const link of result.links){
  if(currentIds.has(link.eventId)||suppressed.has(link.eventId))continue;
  // The machine cannot invent a new point or choose among duplicate venue pins.
  const points=locations.filter(p=>p.venueId===link.venueId&&p.certainty==='confirmed');
  if(points.length!==1)return hold('verified_point_ambiguous_or_missing');
  const point=points[0];
  if(Math.abs(point.coordinates.latitude-link.point.coordinates.latitude)>0.00001||Math.abs(point.coordinates.longitude-link.point.coordinates.longitude)>0.00001)return hold('verified_point_coordinates_changed');
  point.linkedEventIds=[...(point.linkedEventIds||[]),link.eventId];currentIds.add(link.eventId);addedEventIds.push(link.eventId);
  owned.set(link.eventId,{eventId:link.eventId,venueId:link.venueId,fingerprint:link.fingerprint});
 }
 if(currentIds.size>500||suppressed.size>500)return hold('publication_inventory_limit');
 return {status:'ready',reason:addedEventIds.length?'verified_additions':'no_public_delta',result,areaData,addedEventIds:addedEventIds.sort(),
  ownership:{version:1,umbrellaPath:input.umbrella.path,policy:FESTIVAL_PUBLICATION_POLICY,machineLinks:[...owned.values()].sort((a,b)=>a.eventId.localeCompare(b.eventId)),suppressedEventIds:[...suppressed].sort()}};
}

export interface FestivalPinnedDocument {path:string;version:{seconds:number;nanoseconds:number};}
/** Transaction fence uses exact database versions, not lossy millisecond timestamps. */
export function assertFestivalPublicationFence(current:FestivalShadowJob|undefined,claim:FestivalShadowJob,nowMs:number,
 references:readonly FestivalPinnedDocument[],read:ReadonlyMap<string,{exists:boolean;version?:{seconds:number;nanoseconds:number}}>,activeParser:boolean):void{
 if(activeParser)throw Error('active_parser_blocks_festival_publication');
 if(!current||current.status!=='running'||current.generation!==claim.generation||current.workerToken!==claim.workerToken||current.inputFingerprint!==claim.inputFingerprint||current.leaseUntilMs<=nowMs)throw Error('stale_festival_publication_worker');
 if(!references.length||references.length>400||new Set(references.map(x=>x.path)).size!==references.length)throw Error('invalid_festival_reference_inventory');
 for(const ref of references){const doc=read.get(ref.path);if(!doc?.exists||!doc.version||doc.version.seconds!==ref.version.seconds||doc.version.nanoseconds!==ref.version.nanoseconds)throw Error('festival_reference_drift:'+ref.path);}
}
export const festivalPublicationFingerprint=(input:FestivalPublicationInput)=>festivalShadowFingerprint({policy:FESTIVAL_PUBLICATION_POLICY,input});
