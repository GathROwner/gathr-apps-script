import type {EventData} from '../types/index.js';
export type ReviewedOccurrenceRetirementPolicy={version:1;kind:'reviewed_duplicate_cleanup';reviewId:string;canonicalEventPath:string;sourceUniqueIds:string[];retiredUniqueIds:string[]};
export type RetirementResult={kind:'none'}|{kind:'hold'}|{kind:'retired';canonicalEventPath:string};

/** Exact reviewed identities only, using the venue already loaded by the
 * parser. No query/cache, fuzzy title match, source-wide exclusion or write. */
export function classifyReviewedOccurrenceRetirement(incoming:EventData,venue?:{id:string;reviewedOccurrenceRetirements?:ReviewedOccurrenceRetirementPolicy}):RetirementResult{
 const uniqueId=String(incoming.uniqueId||''),root=uniqueId.split('_')[0],d=venue?.reviewedOccurrenceRetirements;
 if(!venue||incoming.venueId!==venue.id||!/^\d{8,}$/.test(root)||!d||d.kind!=='reviewed_duplicate_cleanup')return{kind:'none'};
 if(d.version!==1||typeof d.reviewId!=='string'||!d.reviewId.trim()||!Array.isArray(d.sourceUniqueIds)||!Array.isArray(d.retiredUniqueIds)||
  d.sourceUniqueIds.length>64||d.retiredUniqueIds.length>64||
  !d.sourceUniqueIds.every(id=>typeof id==='string'&&/^\d{8,}$/.test(id))||
  !d.retiredUniqueIds.every(id=>typeof id==='string'&&d.sourceUniqueIds.includes(id.split('_')[0]))||
  typeof d.canonicalEventPath!=='string'||!d.canonicalEventPath.startsWith(`venues/${venue.id}/events/`)||
  d.canonicalEventPath.split('/').length!==4||!d.canonicalEventPath.split('/')[3])return{kind:'hold'};
 if(!d.sourceUniqueIds.includes(root)||!d.retiredUniqueIds.includes(uniqueId))return{kind:'none'};
 return{kind:'retired',canonicalEventPath:d.canonicalEventPath};
}
