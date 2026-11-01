import type {ExtractedItem, FormattedEvent} from './types.js';

const key=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];

function minute(value:unknown):number|undefined {
  const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if(!match || +match[2]>59 || +match[1]>(match[3]?12:23))return undefined;
  return (match[3]?(+match[1]%12+(match[3].toLowerCase()==='pm'?12:0)):+match[1])*60 + +match[2];
}

/** A source contradiction is a hold, never an AM/PM repair or a 24h guess. */
export function sourceClockContradiction(item:Pick<ExtractedItem,'name'|'startTime'|'endTime'|'timeFlags'> &
  {date?:string;startDate?:string;endDate?:string;description?:string},allowPrintedRangeRecovery=true):string|undefined {
  if(item.timeFlags?.start?.source!=='explicit'||item.timeFlags?.end?.source!=='explicit')return undefined;
  const start=minute(item.startTime),end=minute(item.endTime);
  if(start===undefined||end===undefined)return undefined;
  const date=item.date||item.startDate||'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(item.endDate||'')&&item.endDate!>date)return undefined;
  const evidence=item.timeFlags.start.evidence;
  const printedRange=evidence===item.timeFlags.end.evidence && String(evidence||'').trim().match(/^(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?)?)\s*[-–—~]\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?)?)$/i);
  // Equal extracted endpoints are not a source contradiction when the retained
  // literal range still has two distinct clocks. Existing range recovery owns it.
  const recoverable=allowPrintedRangeRecovery&&printedRange&&key(printedRange[1])!==key(printedRange[2]);
  if(start===end && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !recoverable &&
      !/\b(?:24[ -]hours?|all[ -]day|overnight|multi[ -]day)\b/i.test(`${item.name} ${item.description||''}`))return 'source_zero_length_clock_range';
  // A dated rink/team-sport session is not a 13-hour match. This deliberately
  // leaves festivals, movies, tournaments and ordinary overnight activities alone.
  if(/\b(?:hockey|figure skating|powerskating|ringette|basketball|volleyball)\b/i.test(item.name) &&
      !/\b(?:tournament|marathon|festival|all[ -]day|overnight)\b/i.test(`${item.name} ${item.description||''}`) &&
      (end-start+1440)%1440>360)return 'source_implausible_sport_clock_range';
  return undefined;
}

/** Repair only duplicate copies of a single named finite weekday range when
 * an explicit caption endpoint independently corroborates the whole inventory. */
export function reconcileCollapsedWeekdayRange(items:ExtractedItem[],caption:string):ExtractedItem[] {
  const source=caption.split(/\n\s*OCR TEXT:/i)[0];
  const groups=new Map<string,ExtractedItem[]>();
  for(const item of items){const id=key(item.name);groups.set(id,[...(groups.get(id)||[]),item]);}
  const replacements=new Map<ExtractedItem,ExtractedItem>();
  for(const group of groups.values()){
    if(group.length<2||group.length>7)continue;
    const first=group[0];
    if(!first.name||!key(source).includes(key(first.name))||!/^\d{4}-\d{2}-\d{2}$/.test(first.date))continue;
    const range=String(first.description||'').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[-–—]\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
    if(!range||!source.includes(range[0]))continue;
    if(!group.every(item=>item.date===first.date && item.startTime===first.startTime && item.endTime===first.endTime &&
        item.venue===first.venue && item.description===first.description && item.relevantImageIndex===first.relevantImageIndex &&
        (!('recurringPattern' in item)||!item.recurringPattern||item.recurringPattern==='none')))continue;
    const firstDay=days.indexOf(range[1].toLowerCase()),lastDay=days.indexOf(range[2].toLowerCase());
    const count=(lastDay-firstDay+7)%7+1;
    if(count<2||group.length!==count||new Date(first.date+'T00:00:00Z').getUTCDay()!==firstDay)continue;
    const end=new Date(Date.parse(first.date+'T00:00:00Z')+(count-1)*86400000),endDate=end.toISOString().slice(0,10);
    const endpoints=[...source.matchAll(/\b(?:last|final)\s+day\s+(?:will\s+be\s+|is\s+)?(?:on\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:\/|,\s*)(\d{2}|20\d{2})\b/gi)];
    const verified=endpoints.length===1 && monthNames[end.getUTCMonth()].startsWith(endpoints[0][1].toLowerCase()) &&
      +endpoints[0][2]===end.getUTCDate() && +(endpoints[0][3].length===2?'20'+endpoints[0][3]:endpoints[0][3])===end.getUTCFullYear();
    group.forEach((item,index)=>replacements.set(item,verified?{...item,date:new Date(Date.parse(first.date+'T00:00:00Z')+index*86400000).toISOString().slice(0,10),
      extractionReason:`${item.extractionReason||''} Finite caption range ${range[0]}, corroborated final day ${endDate}; occurrence ${index+1}/${count}.`}
      :{...item,_sourcePublicationHold:'collapsed_weekday_range_requires_date_review'}));
  }
  return items.map(item=>replacements.get(item)||item);
}

/** Bind a travel announcement's destination only to a confirmed address quoted
 * in that same caption. Origin/product geography cannot supply attendee region. */
export function bindCaptionAttendeeRegion(item:ExtractedItem,caption:string):ExtractedItem {
  // Internal proof is derived state, never a model/carried-input credential.
  // Rebuild it from the current item's quote and current caption on every pass.
  item={...item};
  delete item._sourceAttendeeLocation;
  const locations=item.spatial?.kind==='single_location'?item.spatial.locations:undefined;
  if(!Array.isArray(locations)||locations.length!==1)return item;
  const location=locations[0];
  if(location?.role!=='location'||location.certainty!=='confirmed'||!/^\d+[A-Za-z]?\s/.test(location.address||'')||
      !key(location.sourceText).includes(key(location.address)))return item;
  const source=caption.split(/\n\s*OCR TEXT:/i)[0];
  if(!key(source).includes(key(location.address)))return item;
  const destinations=[...source.matchAll(/\b(?:heading|travell?ing|coming)\s+to\s+(Ontario|Nova Scotia|New Brunswick|Quebec|Alberta|British Columbia|Prince Edward Island)\s+for\s+(?:our\s+)?(?:very\s+)?(?:first\s+)?([^.!?\n]{3,100})/gi)];
  if(destinations.length!==1)return item;
  const destination=destinations[0],context=key(destination[2]),title=key(item.name),venue=key(item.venue);
  if(!venue||!context.includes(venue)||!title.includes(venue)||! /\b(?:events?|sampling|shows?|performances?|workshops?)\b/i.test(destination[2]))return item;
  return {...item,_sourceAttendeeLocation:{label:location.label,address:location.address!,province:destination[1],sourceText:location.sourceText!}};
}

export function restoreSourceAttendeeLocation(event:FormattedEvent,item?:ExtractedItem):FormattedEvent {
  const proof=item?._sourceAttendeeLocation;
  if(!proof)return event;
  return {...event,address:proof.address,locationLabel:proof.label,locationProvince:proof.province,_sourceAttendeeLocation:{...proof}} as FormattedEvent;
}

/** Keep an end-only source reviewable when formatting omits it. This is private
 * inventory, not a default opening time or a date-only publication decision. */
export function omittedEndOnlySourceItems(items:ExtractedItem[],events:FormattedEvent[]):ExtractedItem[] {
  return items.filter(item=>!String(item.startTime||'').trim() && Boolean(String(item.endTime||'').trim()) &&
    item.timeFlags?.end?.source==='explicit' && !events.some(event=>key(event.name)===key(item.name)&&event.startDate===item.date))
    .map(item=>({...item,_sourcePublicationHold:'formatter_omitted_end_only_source'}));
}
