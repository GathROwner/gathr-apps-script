/** Literal UTF-16 offsets in one original caption document; no inferred text. */
import {DateTime} from 'luxon';
export interface FestivalCaptionScope {
  documentIndex: -1;
  headerStart: number; headerEnd: number; rowStart: number; rowEnd: number;
}
export interface FestivalEvidenceDocument {index: number; text: string}
const DATE_HEADING=/^(?:(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?),?\s+)?(?:20\d{2}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+20\d{2})?)(?:\s+events:?)?\s*$/i;

/** Missing heading years use only the already bound edition year; printed years win. */
export function festivalCaptionHeadingDate(header: string, editionYear: number): string | undefined {
  if(!DATE_HEADING.test(header.trim()))return undefined;
  const iso=header.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  const date=header.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i);
  const month=date?['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(date[1].slice(0,3).toLowerCase())+1:0;
  const parsed=iso?DateTime.fromISO(iso):date?DateTime.fromObject({year:Number(date[3]||editionYear),month,day:Number(date[2])}):undefined;
  const weekday=header.trim().match(/^(mon|tue|wed|thu|fri|sat|sun)/i)?.[1];
  if(!parsed?.isValid||weekday&&weekday.toLowerCase()!==parsed.weekdayShort?.toLowerCase())return undefined;
  return parsed.toISODate()||undefined;
}

export function festivalCaptionDateHeadings(text: string): {text: string; start: number; end: number}[] {
  const headings=[];let offset=0;
  for(const line of text.split('\n')) {
    if(DATE_HEADING.test(line.trim()))headings.push({text:line,start:offset,end:offset+line.length});
    offset+=line.length+1;
  }
  return headings;
}

export function validFestivalCaptionScope(input: {
  scope: FestivalCaptionScope; documents: readonly FestivalEvidenceDocument[];
  scopeText: string; rowText: string; headerText: string;
}): boolean {
  const {scope,documents,scopeText,rowText,headerText}=input;
  if(scope.documentIndex!==-1||documents.filter(d=>d.index===-1).length!==1)return false;
  const document=documents.find(d=>d.index===-1)!;
  if(![scope.headerStart,scope.headerEnd,scope.rowStart,scope.rowEnd].every(Number.isSafeInteger)||
      scope.headerStart<0||scope.headerEnd<=scope.headerStart||scope.rowStart<scope.headerEnd||
      scope.rowEnd<=scope.rowStart||scope.rowEnd>document.text.length)return false;
  if(document.text.slice(scope.headerStart,scope.headerEnd)!==headerText||
      document.text.slice(scope.rowStart,scope.rowEnd)!==rowText||
      document.text.slice(scope.headerStart,scope.rowEnd)!==scopeText)return false;
  const governing=festivalCaptionDateHeadings(document.text).filter(h=>h.start<scope.rowStart).at(-1);
  const lineStart=document.text.lastIndexOf('\n',scope.rowStart-1)+1;
  const lineEnd=document.text.indexOf('\n',scope.rowEnd);
  return governing?.start===scope.headerStart&&governing.end===scope.headerEnd&&
    !document.text.slice(lineStart,scope.rowStart).trim()&&
    !document.text.slice(scope.rowEnd,lineEnd<0?document.text.length:lineEnd).trim();
}

/** A repeated literal row is safe only when exactly one occurrence has this heading. */
export function expandFestivalCaptionDateScope<T extends {
  dateText?: string; scopeText: string; sourceIndices: number[];
}>(item: T, documents: readonly FestivalEvidenceDocument[]): T & {
  activityRowText?: string; dateHeaderText?: string; captionScope?: FestivalCaptionScope;
} {
  if(!item.dateText||item.scopeText.includes(item.dateText)||!item.sourceIndices?.includes(-1))return item;
  const captions=documents.filter(d=>d.index===-1);if(captions.length!==1)return item;
  const caption=captions[0].text,row=item.scopeText;
  if(!row||/[\r\n]/.test(row))return item;
  const headings=festivalCaptionDateHeadings(caption),matches:FestivalCaptionScope[]=[];
  let position=caption.indexOf(row);
  while(position>=0){
    const header=headings.filter(h=>h.start<position).at(-1);
    if(header?.text.includes(item.dateText)){
      const scope:FestivalCaptionScope={documentIndex:-1,headerStart:header.start,headerEnd:header.end,rowStart:position,rowEnd:position+row.length};
      if(validFestivalCaptionScope({scope,documents,scopeText:caption.slice(header.start,scope.rowEnd),rowText:row,headerText:header.text}))matches.push(scope);
    }
    position=caption.indexOf(row,position+row.length);
  }
  if(matches.length!==1)return item;
  const captionScope=matches[0];
  return {...item,activityRowText:row,dateHeaderText:caption.slice(captionScope.headerStart,captionScope.headerEnd),
    scopeText:caption.slice(captionScope.headerStart,captionScope.rowEnd),captionScope};
}
