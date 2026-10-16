/** Literal source offsets. Context may govern rows, never another image or date section. */
import {DateTime} from 'luxon';
import type {FestivalEvidenceDocument} from './festivalCaptionScope.js';
export interface FestivalSourceScope {
 version:1;documentIndex:number;kind:'date_heading'|'caption_context';
 contextStart:number;contextEnd:number;rowStart:number;rowEnd:number;dateStart:number;dateEnd:number;
}
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const FRENCH=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const FRDAYS=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const mon='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const frmon='(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)';
const day='(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const frday='(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
const EN=new RegExp(`^(?:(${day})[,]?\\s+)?(${mon})[.]?\\s+(\\d{1,2})(?:[,]?\\s+(20\\d{2}))?(?:\\s+events:?)?\\s*$`,'i');
const FR=new RegExp(`^(?:(${frday})\\s+)?(\\d{1,2})\\s+(${frmon})(?:\\s+(20\\d{2}))?\\s*$`,'i');
const prose=new RegExp(`\\b(${day})[,]?\\s+(${mon})[.]?\\s+(\\d{1,2})(?:[,]?\\s+(20\\d{2}))?`,'ig');
const iso=/^20\d{2}-\d{2}-\d{2}$/;
const dateLike=new RegExp(`\\b(?:${mon})[.]?\\s+\\d{1,2}\\b|\\b\\d{1,2}\\s+(?:${frmon})\\b|\\b20\\d{2}-\\d{2}-\\d{2}\\b`,'i');
function single(header:string,year:number):string|undefined{
 const h=header.trim();if(iso.test(h)){const d=DateTime.fromISO(h);return d.isValid?d.toISODate()!:undefined;}
 const en=h.match(EN),fr=h.match(FR);if(!en&&!fr)return;
 const month=en?MONTHS.findIndex(m=>m.startsWith(en[2].toLowerCase().slice(0,3)))+1:FRENCH.indexOf(fr![3].toLowerCase())+1;
 const d=DateTime.fromObject({year:Number((en||fr)![4]||year),month,day:Number(en?en[3]:fr![2])});
 const weekday=(en||fr)![1]?.toLowerCase();
 if(!d.isValid||weekday&&(en?DAYS.findIndex(x=>x.startsWith(weekday.slice(0,3))):FRDAYS.indexOf(weekday))!==d.weekday-1)return;
 return d.toISODate()!;
}
/** Explicit two-day headings produce only their two dates, never an inferred range. */
export function festivalSourceHeadingDates(header:string,year:number,kind:FestivalSourceScope['kind']='date_heading'):string[]{
 if(kind==='caption_context'){
  if(!/^(?:join us|come (?:join|celebrate)|rejoignez-nous)\b/i.test(header.trim()))return [];
  const matches=[...header.matchAll(prose)];if(matches.length!==1)return [];
  const m=matches[0],date=single(`${m[1]}, ${m[2]} ${m[3]}${m[4]?', '+m[4]:''}`,year);
  // A second date, numeric range or conflicting printed year remains ambiguous.
  const rest=header.replace(m[0],'');if(dateLike.test(rest)||/\b20\d{2}\b|\b\d{1,2}\s*[-–/]\s*\d{1,2}\b/.test(rest))return [];
  return date?[date]:[];
 }
 const lines=header.trim().split(/\r?\n/);if(lines.length===2&&/^AND\s+/i.test(lines[1])){
  const dates=[single(lines[0],year),single(lines[1].replace(/^AND\s+/i,''),year)];return dates.every(Boolean)?dates as string[]:[];
 }
 const fr=header.trim().match(new RegExp(`^(${frday})\\s+(\\d{1,2})\\s+ET\\s+(${frday})\\s+(\\d{1,2})\\s+(${frmon})(?:\\s+(20\\d{2}))?$`,'i'));
 if(fr){const dates=[single(`${fr[1]} ${fr[2]} ${fr[5]}${fr[6]?' '+fr[6]:''}`,year),single(`${fr[3]} ${fr[4]} ${fr[5]}${fr[6]?' '+fr[6]:''}`,year)];return dates.every(Boolean)?dates as string[]:[];}
 const date=single(header,year);return date?[date]:[];
}
function headingShape(text:string):boolean{
 return EN.test(text.trim())||FR.test(text.trim())||iso.test(text.trim())||
  new RegExp(`^${frday}\\s+\\d{1,2}\\s+ET\\s+${frday}\\s+\\d{1,2}\\s+${frmon}(?:\\s+20\\d{2})?$`,'i').test(text.trim());
}
function headings(text:string,index:number){
 const lines=[];let start=0;for(const line of text.split('\n')){lines.push({start,end:start+line.length,text:line});start+=line.length+1;}
 const result:{start:number;end:number;text:string;kind:FestivalSourceScope['kind']}[]=[];
 for(let i=0;i<lines.length;i++){
  const l=lines[i];if(headingShape(l.text)){
   const next=lines[i+1];if(next&&/^AND\s+/i.test(next.text.trim())&&headingShape(next.text.trim().replace(/^AND\s+/i,''))){result.push({start:l.start,end:next.end,text:text.slice(l.start,next.end),kind:'date_heading'});i++;}
   else result.push({...l,kind:'date_heading'});
  }else if(index===-1&&/^(?:join us|come (?:join|celebrate)|rejoignez-nous)\b/i.test(l.text.trim())&&dateLike.test(l.text))result.push({...l,kind:'caption_context'});
  // An unrecognized/range date line must still stop an earlier heading.
  else if(dateLike.test(l.text)&&!/^\s*(?:register|inscription|cost|price|tickets?)\b/i.test(l.text))result.push({...l,kind:'date_heading'});
 }
 return result;
}
export function validFestivalSourceScope(input:{scope:FestivalSourceScope;documents:readonly FestivalEvidenceDocument[];scopeText:string;rowText:string;dateText:string;timeText:string;venueText:string}):boolean{
 const {scope:s,documents,scopeText,rowText,dateText,timeText,venueText}=input;
 if(s.version!==1||!Number.isInteger(s.documentIndex)||s.documentIndex< -1||!['date_heading','caption_context'].includes(s.kind))return false;
 const docs=documents.filter(d=>d.index===s.documentIndex);if(docs.length!==1)return false;const text=docs[0].text;
 if(![s.contextStart,s.contextEnd,s.rowStart,s.rowEnd,s.dateStart,s.dateEnd].every(Number.isSafeInteger)||s.contextStart<0||s.contextStart!==s.dateStart||s.dateEnd<=s.dateStart||s.rowStart<=s.dateEnd||s.rowEnd<=s.rowStart||s.contextEnd!==s.rowEnd||s.rowEnd>text.length)return false;
 if(text.slice(s.contextStart,s.contextEnd)!==scopeText||text.slice(s.rowStart,s.rowEnd)!==rowText)return false;
 const governing=headings(text,s.documentIndex).filter(h=>h.start<s.rowStart).at(-1);
 if(!governing||governing.start!==s.dateStart||governing.end!==s.dateEnd||governing.kind!==s.kind||!governing.text.includes(dateText))return false;
 const lineStart=text.lastIndexOf('\n',s.rowStart-1)+1,next=text.indexOf('\n',s.rowEnd);
 if(text.slice(lineStart,s.rowStart).trim()||text.slice(s.rowEnd,next<0?text.length:next).trim())return false;
 if(timeText&&!rowText.includes(timeText))return false;
 if(venueText&&!rowText.includes(venueText)){
  if(s.kind!=='caption_context'||s.documentIndex!==-1||!governing.text.includes(venueText)||!/\bat\s+/i.test(governing.text))return false;
 }
 if(s.kind==='caption_context'){
  const between=text.slice(s.dateEnd,s.rowStart);
  if(between.length>1200||/\b(?:venue|location|lieu)\s*:/i.test(between)||/\b(?:at|At)\s+[A-ZÀ-Ÿ]/.test(between)||/\b(?:festival|fest|programme|program|schedule)\b/i.test(between))return false;
 }
 return true;
}
export function expandFestivalSourceScope<T extends {scopeText:string;dateText?:string;timeText?:string;venueText?:string;sourceIndices:number[]}>(item:T,documents:readonly FestivalEvidenceDocument[]):T&{sourceScope?:FestivalSourceScope;activityRowText?:string;dateHeaderText?:string}{
 if(!item.dateText||item.scopeText.includes(item.dateText))return item;
 const matches:{scope:FestivalSourceScope;document:FestivalEvidenceDocument;heading:string}[]=[];
 for(const document of documents.filter(d=>item.sourceIndices.includes(d.index))){
  let offset=document.text.indexOf(item.scopeText);
  while(offset>=0){const h=headings(document.text,document.index).filter(h=>h.start<offset).at(-1);
   if(h&&h.text.includes(item.dateText)){
    const s:FestivalSourceScope={version:1,documentIndex:document.index,kind:h.kind,contextStart:h.start,contextEnd:offset+item.scopeText.length,rowStart:offset,rowEnd:offset+item.scopeText.length,dateStart:h.start,dateEnd:h.end};
    if(validFestivalSourceScope({scope:s,documents,scopeText:document.text.slice(s.contextStart,s.contextEnd),rowText:item.scopeText,dateText:item.dateText,timeText:item.timeText||'',venueText:item.venueText||''}))matches.push({scope:s,document,heading:h.text});
   }offset=document.text.indexOf(item.scopeText,offset+Math.max(1,item.scopeText.length));
  }
 }
 if(matches.length!==1)return item;const m=matches[0];
 return{...item,activityRowText:item.scopeText,dateHeaderText:m.heading,scopeText:m.document.text.slice(m.scope.contextStart,m.scope.contextEnd),sourceScope:m.scope};
}
