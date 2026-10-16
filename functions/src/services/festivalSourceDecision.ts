/** Human-reviewed nonmembership is distinct from complete OCR. Never grants a link. */
export interface FestivalSourceDecision {
 version:1;kind:'reviewed_not_member';editionId:string;sourceId:string;captureKey:string;
 sourceFingerprint:string;evidencePolicy:string;reviewId:string;reason:string;reviewedAt:string;
}
export function validFestivalNonmembership(decision:unknown,expected:{editionId:string;sourceId:string;captureKey:string;sourceFingerprint:string;evidencePolicy:string}):decision is FestivalSourceDecision{
 if(!decision||typeof decision!=='object')return false;const d=decision as FestivalSourceDecision;
 return d.version===1&&d.kind==='reviewed_not_member'&&Object.entries(expected).every(([key,value])=>d[key as keyof FestivalSourceDecision]===value)&&
  typeof d.reviewId==='string'&&!!d.reviewId.trim()&&typeof d.reason==='string'&&!!d.reason.trim()&&typeof d.reviewedAt==='string'&&Number.isFinite(Date.parse(d.reviewedAt));
}
