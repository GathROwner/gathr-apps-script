import type {FestivalEvidenceDocument} from './festivalCaptionScope.js';
import type {FestivalSourceScope} from './festivalSourceScope.js';

const key=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/** A poster title can head a programme without literally saying "Programme".
 * Require the current edition at the beginning of the SAME image as the row.
 * Never borrow caption words, another image, a biography or an arbitrary mention.
 */
export function literalFestivalProgrammeHeading(input:{documents:readonly FestivalEvidenceDocument[];scope?:FestivalSourceScope;festivalNameText:string;yearText:string}):string|undefined {
 const {scope,documents,festivalNameText,yearText}=input;
 if(!scope||scope.documentIndex<0||!/^20\d{2}$/.test(yearText)||!festivalNameText.trim())return;
 const matching=documents.filter(d=>d.index===scope.documentIndex);if(matching.length!==1)return;
 const doc=matching[0].text,heading=doc.split(/\n\s*\n/)[0];
 if(!heading||heading.length>500||heading.length>scope.contextStart||!heading.includes(festivalNameText))return;
 const years=heading.match(/\b(?:19|20)\d{2}\b/g)||[];
 if(years.length!==1||years[0]!==yearText)return;
 const normalized=key(heading),name=key(festivalNameText);
 if(!/\b(?:fest|festival)\b/.test(name)||!(normalized.startsWith(`${yearText} ${name} `)||normalized===`${yearText} ${name}`||normalized.startsWith(`${name} ${yearText} `)||normalized===`${name} ${yearText}`))return;
 // Repeated identical headings do not establish which programme owns the row.
 if(doc.indexOf(heading,heading.length)>=0)return;
 return heading;
}
