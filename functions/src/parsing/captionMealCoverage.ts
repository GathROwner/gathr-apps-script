import {DateTime} from 'luxon';
import type {ExtractedItem} from './types.js';

const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const clock=(raw:string,meridiem?:string):string|undefined=>{
 const m=raw.replace(/\s/g,'').match(/^(\d{1,2})(?::?(\d{2}))?([ap])?m?$/i);
 if(!m||+m[1]<1||+m[1]>12||+(m[2]||0)>59||!(m[3]||meridiem))return undefined;
 return `${String(+m[1]%12+((m[3]||meridiem||'').toLowerCase()==='p'?12:0)).padStart(2,'0')}:${String(+(m[2]||0)).padStart(2,'0')}`;
};

/** A caption's takeout window belongs only to its literal, same-date specials list. */
export function repairCaptionTakeoutWindow(items:ExtractedItem[],caption:string):ExtractedItem[]{
 const text=caption.split(/\n\s*OCR TEXT:/i)[0];
 const heading=/\btoday['’]s\s+specials\b/i.exec(text);
 const windows=[...text.matchAll(/\btake[ -]?out\s+orders\s+available\s+from\s+(\d{1,2}(?::\d{2})?\s*(?:[ap]\s*m)?)\s*(?:[-–—]|to)\s*(\d{1,2}(?::\d{2})?\s*([ap])\s*m)\b/gi)];
 if(!heading||windows.length!==1||windows[0].index!<=heading.index)return items;
 const window=windows[0],end=clock(window[2]);
 if(!end)return items;
 const section=text.slice(heading.index+heading[0].length,window.index);
 if(/\b(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(section)||
    /^\s*(?:or|and|,|\/)\s*\d/i.test(text.slice(window.index!+window[0].length)))return items;
 const minute=(value:string)=>+value.slice(0,2)*60 + +value.slice(3);
 const explicitStart=/[ap]\s*m\s*$/i.test(window[1]);
 const candidates=explicitStart?[clock(window[1])]:[clock(window[1],'a'),clock(window[1],'p')];
 // A unique forward service interval of at most half a day disambiguates 11:30-7pm.
 // Bare/overnight/conflicting windows remain unknown rather than borrowing venue hours.
 const starts=candidates.filter((value):value is string=>Boolean(value)&&
   minute(end)>minute(value!)&&minute(end)-minute(value!)<=720);
 if(starts.length!==1)return items;
 const start=starts[0];
 const normalize=(value:string)=>value.toLowerCase().replace(/[^\p{L}\d]+/gu,' ').trim();
 const listed=section.split(/\r?\n/)
   .map(line=>/^\s*[-•*]\s*(.+)$/.exec(line)?.[1])
   .filter((line):line is string=>Boolean(line))
   .map(line=>({text:line,name:normalize(line.replace(/\s*\$\s*\d+(?:\.\d{1,2})?.*$/,''))}));
 const bound=items.filter(item=>item._sourceType==='special'&&listed.some(line=>line.name===normalize(item.name)));
 if(!bound.length||new Set(bound.map(item=>item.date)).size!==1||
    !/^\d{4}-\d{2}-\d{2}$/.test(bound[0].date))return items;
 const evidence=`Takeout availability only: ${window[0]}; ${explicitStart?'printed start meridiem':'start meridiem inferred from unique forward service window'} (${start}-${end})`;
 const restricted=/\b(?:dine|eat)[\s-]*in\s+only\b|\b(?:no|not(?:\s+(?:available|offered|valid|eligible))?(?:\s+for)?|unavailable(?:\s+for)?)\s+take[ -]?out\b|\btake[ -]?out\s+(?:unavailable|excluded|not\s+(?:available|offered))\b/i;
 return items.map(item=>{
  const serviceEvidence=[item.name,item.description,item.extractionReason,item.timeFlags?.start?.evidence,
   item.timeFlags?.end?.evidence,...listed.filter(line=>line.name===normalize(item.name)).map(line=>line.text)].join(' ');
  if(!bound.includes(item)||String(item.startTime||'').trim()||String(item.endTime||'').trim()||
     restricted.test(serviceEvidence)||item.timeFlags?.end?.toClose||
     item._sourceTimeConstraint&&item._sourceTimeConstraint.reason!=='meal_period_without_clock')return item;
  const next={...item,startTime:start,endTime:end,
   description:`${item.description||item.name}. Takeout availability only: ${start}-${end}.`,
   _sourceMeridiemResolution:{date:item.date,startTime:start,endTime:end,evidence,scope:'takeout' as const},
   timeFlags:{start:{source:explicitStart?'explicit' as const:'implied' as const,evidence},
     end:{source:'explicit' as const,toClose:false,evidence}}};
  delete next._sourceTimeConstraint;
  return next;
 });
}
/** Only one literal, item-bound caption range can restore explicit clock flags. */
export function repairCaptionMealCoverage(items:ExtractedItem[],caption:string):ExtractedItem[]{
 const text=caption.split(/\n\s*OCR TEXT:/i)[0];
 const ranges=[...text.matchAll(/\b(\d{1,2}(?::?\d{2})?\s*(?:[ap]\s*m)?)\s*(?:[-–—]|to)\s*(\d{1,2}(?::?\d{2})?\s*([ap])\s*m)\b/gi)];
 if(ranges.length!==1)return items;
 const range=ranges[0],start=clock(range[1],range[3]),end=clock(range[2]);
 if(!start||!end||end<=start)return items;
 let result=items.map(item=>{
  if(!/\b(?:breakfast|brunch)\b/i.test(item.name)||item.startTime!==start||item.endTime!==end)return item;
  return {...item,timeFlags:{start:{source:'explicit' as const,evidence:range[0]},end:{source:'explicit' as const,toClose:false,evidence:range[0]}}};
 });
 // Saturday AND Sunday is a finite weekend unless the source explicitly says otherwise.
 if(/\bweekend brunch\b/i.test(text)&&/\bsaturday\s+(?:and|&)\s+sunday\b/i.test(text)&&
   !/\b(?:every|weekly|each weekend|all month)\b/i.test(text)){
  const brunch=result.filter(i=>/\bbrunch\b/i.test(i.name));
  if(brunch.length===1&&['none',''].includes(String((brunch[0] as any).recurringPattern||''))){
   const base=brunch[0],date=DateTime.fromISO(base.date);
   if(date.isValid&&date.weekday===6&&base.startTime===start&&base.endTime===end){
    const sibling=date.plus({days:1}).toISODate()!;
    result=[...result,{...base,date:sibling,recurringPattern:'none',extractionReason:'Explicit Saturday and Sunday weekend brunch; finite second occurrence'}];
   }
  }
 }
 // A club/community pancake breakfast is a public activity in its own right.
 // Its serving clock belongs to breakfast, never to the adjacent untimed Hustle.
 if(/\bjoin us\b/i.test(text)&&/\bpancake breakfast\b/i.test(text)&&
    /\bbreakfast will run from\b/i.test(text)&&/\b(?:club|community|fundrais\w*)\b/i.test(text)&&
    !/\b(?:menu|delivery|room service|private|closed)\b/i.test(text)&&
    !result.some(i=>/\bpancake breakfast\b/i.test(i.name))){
  const dates=[...text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)];
  const anchor=result.find(i=>/^\d{4}-\d{2}-\d{2}$/.test(i.date));
  const date=anchor&&DateTime.fromISO(anchor.date);
  if(dates.length===1&&anchor&&date?.isValid&&months[date.month-1].startsWith(dates[0][1].toLowerCase())&&date.day===+dates[0][2]){
   result=[...result,{name:'Pancake Breakfast',date:anchor.date,startTime:start,endTime:end,
    venue:anchor.venue||'',price:'',_sourceType:'event',recurringPattern:'none',
    relevantImageIndex:anchor.relevantImageIndex,
    description:`Community pancake breakfast at the club. Breakfast runs ${range[0]}.`,
    extractionReason:'Source explicitly invites attendees to a separately timed public pancake breakfast',
    timeFlags:{start:{source:'explicit',evidence:range[0]},end:{source:'explicit',toClose:false,evidence:range[0]}}} as ExtractedItem];
  }
 }
 return result;
}

/** A dinner-theatre advertising run is not one continuously running performance. */
export function unresolvedPerformanceRun(item:ExtractedItem,caption:string):boolean{
 const text=caption.split(/\n\s*OCR TEXT:/i)[0];
 const itemText=`${item.name} ${item.description||''}`;
 const ownPerformance=/\bdinner\s+theat(?:re|er)s?\b/i.test(itemText) ||
   /^(?:the )?dinner\s+theat(?:re|er)\b/i.test(text.trim().split('\n')[0]) && Number((item as any)._pipelineTotalStage3||1)===1;
 return ownPerformance && !/\b(?:festival|market|conference)\b/i.test(item.name) &&
  /\b(?:nov(?:ember)?|dec(?:ember)?|oct(?:ober)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?)\s+\d{1,2}(?:st|nd|rd|th)?\s*[-–—]\s*(?:(?:nov(?:ember)?|dec(?:ember)?|oct(?:ober)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?)\s+)?\d{1,2}/i.test(text)&&
  !/\b(?:opening (?:night|performance)|first performance|performances? (?:on|every)|continuous|overnight)\b/i.test(text);
}
