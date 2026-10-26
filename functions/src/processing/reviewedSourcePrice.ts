import type {EventData} from '../types/index.js';
type Proof={version:1;sourceUniqueId:string;imageSha256:string;imageUrl:string;price:string;reviewId:string};
/** A reviewed amount for this exact source/image cannot be repainted by another
 * model transcription of that source. Different occurrences are not aliased. */
export function reviewedSourcePrice(existing:EventData,incoming:EventData):Proof|undefined{
 const p=(existing as any).reviewedSourcePrice as Proof|undefined;
 if(!p||p.version!==1||!/^\d{8,25}$/.test(p.sourceUniqueId)||!/^[a-f0-9]{64}$/.test(p.imageSha256)||
    !/^\$\d+(?:\.\d{1,2})?$/.test(p.price)||!p.reviewId||!p.imageUrl||
    existing.venueId!==incoming.venueId||existing.startDate!==incoming.startDate||existing.startTime!==incoming.startTime)return;
 const ids=(e:EventData)=>[String(e.uniqueId||'').split('_')[0],...(e.sourceUniqueIds||[])];
 if(!ids(existing).includes(p.sourceUniqueId)||!ids(incoming).includes(p.sourceUniqueId))return;
 // Managed URLs change on identical-byte reuploads. Without trusted incoming
 // original-image hashes, even a new URL cannot authorize a changed amount;
 // a truly changed source needs a new review before the protected price moves.
 return p;
}
export function contradictsReviewedPrice(value:unknown,proof:Proof,priceField=false):boolean{
 if(priceField&&/^(?:\d+(?:\.\d{1,2})?)$/.test(String(value||'').trim()))return Number(value)!==Number(proof.price.slice(1));
 const amounts=[...String(value||'').matchAll(/\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*\$/g)].map(m=>Number(m[1]||m[2]));
 return amounts.some(n=>n!==Number(proof.price.slice(1)));
}
