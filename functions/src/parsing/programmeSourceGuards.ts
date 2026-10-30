import type {RawRowData} from '../types/index.js';
import type {ExtractedItem,RecurringPattern} from './types.js';

const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const relative=/\b(?:today|tomorrow|tonight|yesterday|(?:this|next|last)\s+(?:week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const captionOnly=(text:string)=>text.split(/(?:^|\n)\s*OCR TEXT\s*:/i)[0];

/** A trainer's description of skills taught daily is not an attendance schedule. */
export function recurrenceScheduleText(text:string):string {
  return text.replace(/\bskills\s+daily\b/gi,'skills');
}

export function hasOnlyDescriptiveSkillRecurrence(text:string):boolean {
  return /\bskills\s+daily\b/i.test(text) &&
    !/\b(?:daily|everyday|every\s+day|each\s+day|weekly|monthly|(?:every|each)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s)\b/i.test(recurrenceScheduleText(text));
}

/** Recover a printed plural weekday only from this calendar item's evidence.
 * The caption supplies the programme month, never another item's cadence. */
export function restoreMonthlyProgrammeWeekday<T extends ExtractedItem>(item:T,sourceText:string):T {
  if(!['calendar','schedule'].includes(String(item._sourceType||'')) ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(item.date||''))return item;
  const caption=captionOnly(sourceText),month=months[Number(item.date.slice(5,7))-1];
  if(!month || months.filter(m=>new RegExp(`\\b${m}\\b`,'i').test(caption)).length!==1 ||
      !new RegExp(`\\b${month}\\b[^\\n.!?]*\\b(?:programmes?|programs?|librar(?:y|ies))\\b`,'i').test(caption))return item;
  const own=`${item.description||''} ${item.extractionReason||''}`;
  if(/\b(?:one[ -]off|one[ -]time|not\s+weekly)\b/i.test(own))return item;
  const printed=[...own.matchAll(/\b(?:listed\s+for\s+|on\s+)(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b|\bweekly\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+program(?:me)?\b/gi)]
    .map(m=>(m[1]?.slice(0,-1)||m[2]).toLowerCase());
  if(new Set(printed).size!==1 || days[new Date(item.date+'T12:00:00Z').getUTCDay()]!==printed[0])return item;
  if(/\b(?:except|closed|closure|cancelled|canceled)\b/i.test(`${own} ${caption}`))
    return {...item,_sourcePublicationHold:'programme_closure_requires_occurrence_review'};
  const pattern=`weekly_${printed[0]}` as RecurringPattern;
  const current=(item as ExtractedItem & {recurringPattern?:RecurringPattern}).recurringPattern;
  if(current && current!=='none' && current!==pattern)return item;
  // Explicit item-local weekday wording establishes cadence, not exceptions.
  // Reviewed exceptions are enforced by the venue's existing exact-source
  // constraints before duplicate selection. Do not infer holiday closures or
  // treat the number of extraction siblings as an attendance inventory.
  return {...item,recurringPattern:pattern,_sourceWeeklyProgramPattern:pattern};
}

/** A month heading is an upper bound, never permission to extend a shorter series. */
export function earlierProgrammeCutoff(existing:string|undefined,monthEnd:string):string {
  return existing&&/^20\d{2}-\d{2}-\d{2}$/.test(existing)&&existing<monthEnd?existing:monthEnd;
}

/** Anchor an original author's relative wording to its recorded timestamp.
 * A sharing caption with its own relative wording still needs separate review. */
export function sourceInterpretationTimestamp(row:RawRowData):string {
  if(row.sourceScraperType==='events'||!row.sharedPostAuthorUrl||!row.sharedPostText||
      !relative.test(row.sharedPostText)||relative.test(String(row.text||'')))return row.timestamp||'';
  const original=Date.parse(String(row.sharedPostTimestamp||'')),shared=Date.parse(String(row.timestamp||''));
  return Number.isFinite(original)&&Number.isFinite(shared)&&original<=shared
    ? String(row.sharedPostTimestamp):row.timestamp||'';
}

/** A single stated programme month bounds its weekly items, never other months. */
export function bindProgrammeMonth<T extends ExtractedItem>(item:T,sourceText:string):T {
  const caption=captionOnly(sourceText),date=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(item.date||'');
  const pattern=String((item as {recurringPattern?:string}).recurringPattern||'');
  if(!date||!/^weekly_/.test(pattern))return item;
  const mentions=[...new Set(months.filter(month=>new RegExp(`\\b${month}\\b`,'i').test(caption)))];
  if(mentions.length!==1)return item;
  const month=mentions[0],monthIndex=months.indexOf(month);
  if(monthIndex!==Number(date[2])-1||!new RegExp(`\\b${month}(?:\\s+20\\d{2})?\\s+(?:programs?\\b|programmes?\\b|at\\b[^\\n.!?]*\\blibrar(?:y|ies)\\b)`,'i').test(caption))return item;
  const years=[...caption.matchAll(/\b20\d{2}\b/g)].map(m=>m[0]);
  if(years.some(year=>year!==date[1]))return item;
  const until=new Date(Date.UTC(Number(date[1]),monthIndex+1,0)).toISOString().slice(0,10);
  const existing=String((item as {recurrenceUntilDate?:string}).recurrenceUntilDate||'');
  if(existing&&(!/^20\d{2}-\d{2}-\d{2}$/.test(existing)||existing<until))return item;
  return {...item,recurrenceUntilDate:until,_sourceProgrammeMonthEnd:until};
}

/** Correct only an occurrence's own single explained date, corroborated by caption.
 * No new occurrence, year inference, clock repair or list expansion occurs here. */
export function restoreExplainedOccurrenceDate<T extends ExtractedItem>(item:T,sourceText:string):T {
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(item.date||''))return item;
  const reason=String(item.extractionReason||'');
  if(/\b(?:originally|previously|formerly|cancelled|canceled|postponed|before|superseded|rescheduled\s+from|moved\s+from)\b/i.test(reason))return item;
  const caption=captionOnly(sourceText);
  if(/\b(?:from\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|cancelled|canceled|not|instead|rather\s+than)\b/i.test(caption))return item;
  // Only an affirmative two-date shared session qualifies. An old date merely
  // mentioned elsewhere in a rescheduling caption must never win.
  const printedDay='(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
  const printedDate=printedDay+',?\\s+[a-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?';
  if(!new RegExp(printedDate+'\\s+(?:and|&)\\s+'+printedDate,'i').test(caption)||
      !/\b(?:each\s+(?:night|day)|both\s+(?:nights|days))\b/i.test(caption))return item;
  const matches=[...reason.matchAll(/\bfor\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday),?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)];
  if(matches.length!==1)return item;
  const [_,weekday,month,day]=matches[0],monthIndex=months.findIndex(m=>m.startsWith(month.toLowerCase()));
  if(monthIndex!==Number(item.date.slice(5,7))-1)return item;
  const date=`${item.date.slice(0,4)}-${String(monthIndex+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
  const parsed=new Date(date+'T12:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||days[parsed.getUTCDay()]!==weekday.toLowerCase())return item;
  const corroboration=new RegExp(`\\b${weekday},?\\s+${month.slice(0,3)}\\w*\\.?\\s+${Number(day)}(?:st|nd|rd|th)?\\b`,'i');
  if(!corroboration.test(caption))return item;
  return date===item.date?item:{...item,date};
}
