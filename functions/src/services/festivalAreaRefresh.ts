import {validateEventAreaData,verifyAreaPublicationReferences} from './areaEventPublication.js';
import type {AreaEventLinkEvidence,ReadAreaReference} from './areaEventPublication.js';
// Keep publisher releases independent of worker/model/capture modules.
const FESTIVAL_PUBLICATION_POLICY='source-verified-additions-v1';

/** Preserve only proven machine links still present in the current public map.
 * A refresh must never restore a removed link or copy private fields publicly.
 */
export async function restoreFestivalAreaRefresh(input:{eventPath:string;eventName:string;startDate:string;endDate:string;approvedArea:unknown;previousArea:unknown;manualEvidence?:AreaEventLinkEvidence[];ownership:Record<string,any>;read:ReadAreaReference}) {
 const owned=input.ownership;
 if(owned.version!==1||owned.umbrellaPath!==input.eventPath||owned.policy!==FESTIVAL_PUBLICATION_POLICY||!Array.isArray(owned.machineLinks)||owned.machineLinks.length>500||
  !Array.isArray(owned.suppressedEventIds)||new Set(owned.machineLinks.map((p:any)=>p.eventId)).size!==owned.machineLinks.length)throw Error('Invalid festival refresh ownership');
 const area=validateEventAreaData(input.approvedArea),previous=validateEventAreaData(input.previousArea),proofs=[...(input.manualEvidence||[])];
 const suppressed=new Set(owned.suppressedEventIds),current=new Map(previous.locations.flatMap(p=>(p.linkedEventIds||[]).map(id=>[id,p.venueId] as const)));
 for(const link of owned.machineLinks){
  if(suppressed.has(link.eventId)||current.get(link.eventId)!==link.venueId)continue;
  const point=area.locations.find(p=>p.venueId===link.venueId&&p.certainty==='confirmed');if(!point)continue;
  const proof=owned.proofs?.[link.eventId];
  if(!/^[a-f0-9]{64}$/.test(link.fingerprint)||proof?.fingerprint!==link.fingerprint||!Array.isArray(proof.evidence)||!proof.evidence.length)throw Error('Missing festival refresh proof');
  const candidates=proof.evidence.filter((p:AreaEventLinkEvidence)=>p.eventPath.split('/').at(-1)===link.eventId&&p.venueId===link.venueId).sort((a:AreaEventLinkEvidence,b:AreaEventLinkEvidence)=>(a.sourceUrl+'\n'+a.sourceText).localeCompare(b.sourceUrl+'\n'+b.sourceText));
  if(!candidates.length)throw Error('Festival refresh proof identity drift');
  point.linkedEventIds=[...new Set([...(point.linkedEventIds||[]),link.eventId])];
  if(!proofs.some(p=>p.eventPath.split('/').at(-1)===link.eventId))proofs.push(candidates[0]);
 }
 const areaData=await verifyAreaPublicationReferences({areaData:area,evidence:proofs,eventName:input.eventName,startDate:input.startDate,endDate:input.endDate,refreshing:true,allowFestivalTitleAliases:true,read:input.read});
 return{areaData,evidence:proofs};
}
