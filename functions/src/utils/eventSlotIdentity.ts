type SlotEvent = {
  eventName?: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  timeFlags?: unknown;
  description?: string;
};

/** Age-group development sessions are distinct slots, even under a generic calendar title. */
export function hasConflictingDevelopmentSlot(left: SlotEvent, right: SlotEvent): boolean {
  const text = `${title(left)} ${title(right)}`;
  if (!/\b(?:community\s+(?:cup\b.{0,40})?development|(?:hockey|skating|ringette)\s+(?:development|training)|powerskating|u\s*[- ]?\d{1,2}\s+development)\b/i.test(text)) return false;
  const groups = (event: SlotEvent) => [...title(event).matchAll(/\bu\s*[- ]?\s*(\d{1,2})\b/gi)].map(m => Number(m[1]));
  const a = groups(left), b = groups(right);
  if (a.length === 1 && b.length === 1 && a[0] !== b[0]) return true;
  const knownClock = (event: SlotEvent) => {
    const value = String(event.startTime || '');
    const flag = timeFlag(event, 'start').source;
    return /^\d{2}:\d{2}$/.test(value) && value !== '00:00' &&
      !['implied', 'semantic', 'none'].includes(flag) ? value : '';
  };
  const startA = knownClock(left), startB = knownClock(right);
  return Boolean(startA && startB && startA !== startB);
}

function title(event: SlotEvent): string {
  return String(event.eventName || event.name || '');
}

export function explicitSlotOrdinal(event: SlotEvent): number | null {
  const match = title(event).match(/\b(?:time\s*slot|slot|group|session)\s*(?:#|no\.?\s*)?([1-9])\b(?!\s*:)/i);
  return match ? Number(match[1]) : null;
}

export function hasConflictingExplicitSlotOrdinals(left: SlotEvent, right: SlotEvent): boolean {
  const leftSlot = explicitSlotOrdinal(left);
  const rightSlot = explicitSlotOrdinal(right);
  return leftSlot !== null && rightSlot !== null && leftSlot !== rightSlot;
}

function distinctiveTitleTokens(event: SlotEvent): Set<string> {
  const normalized = title(event)
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, '')
    .replace(/\b(?:time\s*slot|slot|group|session)\s*(?:#|no\.?\s*)?[1-9]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');
  const ignored = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'at', 'lets', 'get',
    'fall', 'spring', 'summer', 'winter', 'kid', 'kids', 'child', 'children',
  ]);
  return new Set(normalized.split(/\s+/).filter(token =>
    token.length >= 3 && !ignored.has(token) && !/^\d+$/.test(token)
  ));
}

function hasSharedTitleCore(left: SlotEvent, right: SlotEvent): boolean {
  const leftTokens = distinctiveTitleTokens(left);
  const rightTokens = distinctiveTitleTokens(right);
  const shared = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return shared >= 3 && shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

/** Use an explicit Group/Slot number only when the surrounding event title also agrees. */
export function hasMatchingExplicitSlotIdentity(left: SlotEvent, right: SlotEvent): boolean {
  const leftSlot = explicitSlotOrdinal(left);
  return leftSlot !== null && leftSlot === explicitSlotOrdinal(right) &&
    hasSharedTitleCore(left, right);
}

function timeFlag(event: SlotEvent, side: 'start' | 'end'): { source: string; evidence: string } {
  const value = (event.timeFlags as Record<string, unknown> | undefined)?.[side] as
    Record<string, unknown> | undefined;
  return { source: String(value?.source || '').toLowerCase(), evidence: String(value?.evidence || '') };
}

function clock(token: string, meridiem: string): string {
  const match = token.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > (meridiem ? 12 : 23) || minute > 59) return '';
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

function printedLabeledSlotRange(event: SlotEvent): [string, string] | null {
  if (explicitSlotOrdinal(event) === null) return null;
  const start = timeFlag(event, 'start');
  const end = timeFlag(event, 'end');
  if (start.source !== 'explicit' || end.source !== 'explicit') return null;
  const evidence = (start.evidence || end.evidence).replace(/[–—]/g, '-').toLowerCase();
  const match = evidence.match(/\b(\d{1,2}:\d{2})\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2}:\d{2})\s*(am|pm)?\b/);
  if (!match) return null;
  const startTime = clock(match[1], match[2] || match[4] || '');
  const endTime = clock(match[3], match[4] || match[2] || '');
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const duration = endHour * 60 + endMinute - startHour * 60 - startMinute;
  return duration > 0 && duration <= 8 * 60 ? [startTime, endTime] : null;
}

function incomingClockSupported(event: SlotEvent, side: 'start' | 'end'): boolean {
  const flag = timeFlag(event, side);
  const value = String(side === 'start' ? event.startTime || '' : event.endTime || '');
  if (flag.source !== 'explicit' || !/^\d{1,2}:\d{2}$/.test(value)) return false;
  const token = flag.evidence.toLowerCase().match(/\b(\d{1,2}:\d{2})\s*(am|pm)?\b/);
  if (!token) return false;
  const sourceTime = clock(token[1], token[2] || '');
  if (!sourceTime) return false;
  if (token[2]) return sourceTime === clock(value, '');
  const [sourceHour, sourceMinute] = sourceTime.split(':').map(Number);
  const [valueHour, valueMinute] = value.split(':').map(Number);
  return sourceMinute === valueMinute && sourceHour % 12 === valueHour % 12;
}

function labeledSlotEvidenceComparison(incoming: SlotEvent, existing: SlotEvent): boolean | null {
  if (explicitSlotOrdinal(incoming) !== null || !hasSharedTitleCore(incoming, existing)) return null;
  const printed = printedLabeledSlotRange(existing);
  if (!printed || !incomingClockSupported(incoming, 'start') ||
      !incomingClockSupported(incoming, 'end')) return null;
  return printed[0] === clock(String(incoming.startTime || ''), '') &&
    printed[1] === clock(String(incoming.endTime || ''), '');
}

/** Match generic new titles to a labeled older session only with corroborating printed clocks. */
export function hasMatchingLabeledSlotTimeEvidence(incoming: SlotEvent, existing: SlotEvent): boolean {
  return labeledSlotEvidenceComparison(incoming, existing) === true;
}

export function hasConflictingLabeledSlotTimeEvidence(incoming: SlotEvent, existing: SlotEvent): boolean {
  return labeledSlotEvidenceComparison(incoming, existing) === false;
}
