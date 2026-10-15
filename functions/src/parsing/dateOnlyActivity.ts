import {DateTime} from 'luxon';
import type {TimeResolvedEvent} from './types.js';
/** A discovery cutoff is expiry policy, never a claimed start/end or all-day window. */
export function dateOnlyActivity(event:TimeResolvedEvent):TimeResolvedEvent | null {
  if(!event._sourceTimeConstraint || event._sourceTimeConstraint.reason === 'unresolved_meridiem' ||
    event.startTime || event.endTime || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate||'') ||
    DateTime.fromISO(event.startDate).toISODate() !== event.startDate ||
    !event.name?.trim() || (event.recurringPattern && event.recurringPattern!=='none') ||
    !(event.isEvent==='Yes' || event.isFoodSpecial==='Yes')) return null;
  const endDate=event.endDate||event.startDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || DateTime.fromISO(endDate).toISODate() !== endDate || endDate<event.startDate) return null;
  const point=(date:string)=>({localDate:date,localTime:null,timeZone:'America/Halifax',status:'unknown'});
  return {...event,endDate,startTime:'',endTime:'',timing:{version:2,timeZone:'America/Halifax',
    scheduleKind:endDate===event.startDate?'timed_session':'multi_day',
    schedule:{start:point(event.startDate),end:point(endDate)},
    estimate:{confidence:'low',discoveryCutoffDate:endDate,discoveryCutoffTime:'23:59',
      method:'source_dated_activity_unknown_clock',estimateVersion:'date-only-activity-v1'},
    policyVersion:'honest-end-times-v2'},timeResolution:{hoursUsed:false,reason:event._sourceTimeConstraint.reason},
    timeFlags:{start:{source:'none',evidence:'Source supplies activity date without a start clock'},
      end:{source:'none',toClose:false,evidence:'Source supplies no finish clock'}}};
}
