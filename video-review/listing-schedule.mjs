// Video eligibility for one-offs and simple, source-linked weekly series.
// Complex/contradictory recurrence stays held; an old anchor is not a series end.
import {hash} from './policy.mjs';
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const truth=v=>v===true||v===1||['true','yes'].includes(String(v).toLowerCase());
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
export const halifaxDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function inactiveListing(e) {
 return !e||[e.isExpired,e.isCancelled,e.cancelled,e.canceled,e.metadata?.isExpired,e.metadata?.isCancelled,e.metadata?.cancelled].some(truth)||
  ['expired','cancelled','deleted','archived'].includes(String(e.status||e.metadata?.status||'').toLowerCase());
}
export const recurringListing=e=>truth(e.isRecurring)||!!e.recurringPattern&&e.recurringPattern!=='none';
export function scheduleFingerprint(e) {
 return hash(JSON.stringify([e.startDate,e.endDate,e.startTime,e.endTime,e.isRecurring,e.recurringPattern,e.recurringDaysOfWeek,e.recurringWeekdaySequence,e.recurringWeekInterval,e.totalOccurrences,e.recurrenceUntilDate,e.excludedDates,e.cancelledDates,e.canceledDates,e.recurrenceExceptions,e.exceptions,e.timing]));
}
export function nextListingOccurrence(e,now=Date.now()) {
 if(inactiveListing(e))return null;
 const today=halifaxDate(now),start=date(e.startDate),end=date(e.endDate||e.startDate);
 if(!recurringListing(e))return end&&end>=today?{date:start||end,endDate:end,recurring:false}:null;
 const match=/^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(e.recurringPattern||'');
 if(!match||!truth(e.isRecurring)||!start||!end||end<start||weekdays[new Date(start+'T12:00:00Z').getUTCDay()]!==match[1])return null;
 // These require the full recurrence engine, not a guessed weekly approximation.
 if(e.recurringWeekdaySequence?.length||['excludedDates','cancelledDates','canceledDates','recurrenceExceptions','exceptions'].some(k=>e[k]!=null&&(!Array.isArray(e[k])||e[k].length)))return null;
 if(e.recurringDaysOfWeek!=null&&(!Array.isArray(e.recurringDaysOfWeek)||e.recurringDaysOfWeek.some(d=>String(d).toLowerCase()!==match[1])))return null;
 const interval=e.recurringWeekInterval==null?1:Number(e.recurringWeekInterval),count=e.totalOccurrences==null?null:Number(e.totalOccurrences);
 if(!Number.isInteger(interval)||interval<1||interval>52||count!==null&&(!Number.isInteger(count)||count<1))return null;
 const until=e.recurrenceUntilDate==null||e.recurrenceUntilDate===''?null:date(e.recurrenceUntilDate);
 if(e.recurrenceUntilDate&& !until)return null;
 const step=interval*7,days=Math.max(0,(Date.parse(today+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000),index=Math.ceil(days/step);
 const occurrence=new Date(Date.parse(start+'T12:00:00Z')+index*step*86400000).toISOString().slice(0,10);
 // A later stored endDate is a bound, while endDate===startDate is the anchor.
 if(until&&occurrence>until||end>start&&occurrence>end||count!==null&&index>=count)return null;
 return {date:occurrence,endDate:occurrence,recurring:true,anchorDate:start,pattern:e.recurringPattern};
}
export function halifaxDayEnd(day) {
 if(!date(day))throw Error('Listing expiry unknown');
 const zone=new Intl.DateTimeFormat('en',{timeZone:'America/Halifax',timeZoneName:'shortOffset'}).formatToParts(new Date(day+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;
 const m=/^GMT([+-])(\d{1,2})$/.exec(zone);if(!m)throw Error('Halifax offset unknown');
 return new Date(`${day}T23:59:59${m[1]}${m[2].padStart(2,'0')}:00`).toISOString();
}
