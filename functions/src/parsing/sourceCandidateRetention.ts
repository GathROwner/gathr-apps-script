import type {ExtractedItem} from './types.js';

export const INDEPENDENT_SOURCE_ITEM_RULES = `
Inspect attached posters independently from the caption: an unrelated caption does not negate a dated public activity printed on a poster. Keep the poster's own date, clock, attendee venue and image index together.
Retain each separately advertised food offer in a calendar cell, including an end-only offer (for example wings until 10pm). Leave an unprinted start empty; never borrow the music start or venue opening time.
A candy handout is a public activity separate from adjacent unnamed entertainment. Extract its own printed window; leave an unprinted date empty for source review. Halloween context alone does not prove October 31. Do not invent a concert name from a bare entertainment clock.
`;

/** Private review inventory only: does not assert that an image is an event. */
export function imageExtractionCoverageHold(imageCount:number,reason:string){
  return imageCount>0 ? [{reason,imageIndices:Array.from({length:imageCount},(_,i)=>i)}] : [];
}

/** Retain a literal caption activity, with no inferred date or image evidence.
 * A missing date is a publication hold, never permission to use post time. */
export function retainCaptionCandyCandidate(items:ExtractedItem[],caption:string):ExtractedItem[]{
  const text=caption.split(/\n\s*OCR TEXT:/i)[0];
  const matches=[...text.matchAll(/\b(?:handing\s+out|giving\s+out)\s+candy\s+from\s+(\d{1,2})(?::([0-5]\d))?\s*[-–—]\s*(\d{1,2})(?::([0-5]\d))?\s*(pm|p\.m\.)/gi)];
  if(matches.length!==1)return items;
  const match=matches[0];
  if(+match[1]<1||+match[1]>12||+match[3]<1||+match[3]>12)return items;
  const clock=(hour:string,minute:string|undefined)=>`${String(+hour%12+12).padStart(2,'0')}:${minute||'00'}`;
  const start=clock(match[1],match[2]),end=clock(match[3],match[4]);
  if(start>=end)return items;
  if(items.some(item=>/\bcandy\s+handout\b/i.test(item.name)&&item.startTime===start&&item.endTime===end))return items;
  const retained=items.map(item=>/\btrick\s+or\s+treat(?:ers|ing)\b/i.test(item.name)&&
    /\bcandy\b/i.test(item.description||'')&&item.startTime!==start
    ? {...item,_sourcePublicationHold:'adjacent_entertainment_not_named_activity'}:item);
  return [...retained,{name:'Candy handout',description:match[0],date:'',startTime:start,endTime:end,
    venue:'',price:'',relevantImageIndex:-1,_sourceType:'event',recurringPattern:'none',
    extractionReason:`Literal caption activity: ${match[0]}. Exact attendance date requires verification.`,
    _sourcePublicationHold:'caption_activity_date_unverified',
    timeFlags:{start:{source:'explicit',evidence:match[0]},end:{source:'explicit',toClose:false,evidence:match[0]}}} as ExtractedItem];
}
