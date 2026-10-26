import {validateEventAreaData,verifyAreaPublicationReferences} from './areaEventPublication.js';
import type {AreaEventLinkEvidence,ReadAreaReference} from './areaEventPublication.js';

/** Additive schedule metadata. The parent remains one canonical venue event. */
export interface EventProgrammeData {
 version:1; status:'verified'|'partial'; venueId:string; linkedEventIds:string[];
 sourceUrl:string; sourceLabel?:string; verifiedAt?:string;
}
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
export function validateEventProgrammeData(value:unknown,ownerVenueId:string):EventProgrammeData {
 const d=value as EventProgrammeData;
 if(!identifier(ownerVenueId)||!d||d.version!==1||!['verified','partial'].includes(d.status)||d.venueId!==ownerVenueId||
    !Array.isArray(d.linkedEventIds)||d.linkedEventIds.length>100||!d.linkedEventIds.every(identifier)||
    new Set(d.linkedEventIds).size!==d.linkedEventIds.length)throw Error('Invalid venue programme identity');
 let source:URL;try{source=new URL(d.sourceUrl);}catch{throw Error('Invalid venue programme source');}
 if(!['https:','http:'].includes(source.protocol)||source.username||source.password)throw Error('Invalid venue programme source');
 for(const field of ['sourceLabel','verifiedAt'] as const)if(d[field]!==undefined&&(typeof d[field]!=='string'||d[field]!.length>300))throw Error('Invalid programme metadata');
 if(d.verifiedAt!==undefined&&!Number.isFinite(Date.parse(d.verifiedAt)))throw Error('Invalid programme verification date');
 // Whitelist public fields. Private review/extraction evidence stays private.
 return {version:1,status:d.status,venueId:ownerVenueId,linkedEventIds:[...d.linkedEventIds],sourceUrl:d.sourceUrl,
  ...(d.sourceLabel?{sourceLabel:d.sourceLabel}:{}),...(d.verifiedAt?{verifiedAt:d.verifiedAt}:{})};
}

/** Same occurrence/source checks as area schedules, without changing scope or inventing a pin. */
export async function verifyVenueProgrammeReferences(input:{
 eventPath:string;eventName:string;startDate:string;endDate:string;programmeData:unknown;
 evidence:AreaEventLinkEvidence[];read:ReadAreaReference;
}):Promise<EventProgrammeData>{
 const match=input.eventPath.match(/^venues\/([A-Za-z0-9_-]{1,160})\/events\/([A-Za-z0-9_-]{1,160})$/);
 if(!match)throw Error('Programme parent must be a canonical venue event');
 const d=validateEventProgrammeData(input.programmeData,match[1]);
 if(d.linkedEventIds.includes(match[2]))throw Error('Programme cannot link itself');
 const venue=await input.read('venues/'+match[1]);
 if(!venue)throw Error('Programme venue missing');
 const v=venue;
 const area=validateEventAreaData({version:1,status:d.status,sourceUrl:d.sourceUrl,locations:[{
  id:'programme_venue',label:String(v.name||''),venueId:d.venueId,certainty:'confirmed',
  coordinates:{latitude:v.latitude,longitude:v.longitude},linkedEventIds:d.linkedEventIds,
 }]});
 await verifyAreaPublicationReferences({areaData:area,evidence:input.evidence,eventName:input.eventName,
  startDate:input.startDate,endDate:input.endDate,allowFestivalTitleAliases:true,read:input.read});
 return d;
}
