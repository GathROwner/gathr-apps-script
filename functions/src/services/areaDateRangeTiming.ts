import {DateTime} from 'luxon';

// Existing a43cb20 client contract; cutoff is discovery policy, never hours.
export const AREA_TIMING_POLICY_VERSION = 'honest-end-times-v2';
export const AREA_DATE_RANGE_ESTIMATE_VERSION = 'area-date-range-discovery-v1';
const METHOD = 'reviewed_area_date_range_discovery_cutoff';
const TIME_ZONE = 'America/Halifax';

export interface AreaDateRangeTiming {
  version: 2;
  timeZone: 'America/Halifax';
  scheduleKind: 'multi_day';
  schedule: {
    start: {localDate: string; localTime: null; timeZone: string; status: 'unknown'};
    end: {localDate: string; localTime: null; timeZone: string; status: 'unknown'};
  };
  estimate: {
    confidence: 'low';
    discoveryCutoffDate: string;
    discoveryCutoffTime: '23:59';
    method: string;
    estimateVersion: string;
  };
  policyVersion: string;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    DateTime.fromISO(value, {zone: TIME_ZONE}).toISODate() === value;
}

function generatedTiming(startDate: string, endDate: string): AreaDateRangeTiming {
  return {
    version: 2, timeZone: TIME_ZONE, scheduleKind: 'multi_day',
    schedule: {
      start: {localDate: startDate, localTime: null, timeZone: TIME_ZONE, status: 'unknown'},
      end: {localDate: endDate, localTime: null, timeZone: TIME_ZONE, status: 'unknown'},
    },
    estimate: {confidence: 'low', discoveryCutoffDate: endDate, discoveryCutoffTime: '23:59',
      method: METHOD, estimateVersion: AREA_DATE_RANGE_ESTIMATE_VERSION},
    policyVersion: AREA_TIMING_POLICY_VERSION,
  };
}

// Exact shape ownership: a rich contract with added observed/display evidence
// must never be removed merely because it retained an old policy marker.
function ownsTiming(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const timing = value as AreaDateRangeTiming;
  if (!validDate(timing.schedule?.start?.localDate) || !validDate(timing.schedule?.end?.localDate)) return false;
  const expected = generatedTiming(timing.schedule.start.localDate, timing.schedule.end.localDate);
  const equal = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  return equal(timing, expected);
}

export function resolveAreaDateRangeTiming(input: {
  locationScope?: string; startDate?: string; endDate?: string;
  startTime?: string | null; endTime?: string | null;
  reviewedDateOnly: boolean; existingTiming?: unknown;
}): {action: 'set'; timing: AreaDateRangeTiming} | {action: 'clear' | 'preserve' | 'none'} {
  const owned = ownsTiming(input.existingTiming);
  if (input.existingTiming != null && !owned) return {action: 'preserve'};
  const eligible = input.reviewedDateOnly && input.locationScope === 'area' &&
    !input.startTime?.trim() && !input.endTime?.trim() && validDate(input.startDate) && validDate(input.endDate) &&
    input.endDate > input.startDate;
  if (eligible) return {action: 'set', timing: generatedTiming(input.startDate!, input.endDate!)};
  return {action: owned ? 'clear' : 'none'};
}
