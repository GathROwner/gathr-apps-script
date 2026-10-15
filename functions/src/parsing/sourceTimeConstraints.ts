import type {ExtractedItem, FormattedEvent} from './types.js';
import {reconcileSourceItemEvidence} from './sourceItemEvidence.js';

export interface SourceTimeConstraint {
  reason: 'unresolved_meridiem' | 'meal_period_without_clock' | 'activity_offer_without_clock' | 'doors_without_showtime' | 'dated_activity_without_clock';
  evidence: string;
}

export interface SourceMeridiemResolution {
  date: string;
  startTime: string;
  endTime: string;
  evidence: string;
}

export interface SourceDurationResolution {
  date: string;
  startTime: string;
  endTime: string;
  minutes: number;
  evidence: string;
}

export function hasSourceClock(value: unknown): boolean {
  const m = /^(\d{1,2})(?::(\d{2}))?(?:\s*([ap])\.?\s*m\.?)?$/i.exec(String(value || '').trim());
  return Boolean(m && +m[1] <= (m[3] ? 12 : 23) && +m[1] >= (m[3] ? 1 : 0) && +(m[2] || 0) < 60);
}

/** An item-local duration is evidence; a category's default duration is not. */
export function resolveSourceDuration(item: ExtractedItem): ExtractedItem {
  if (hasSourceClock(item.endTime)) return item;
  // A film's running time, a song length or a meal's service window is not a session duration.
  if (!/\b(?:class|lesson|workshop|session|fitness|yoga|zumba|course|practice|guided\s+tour)\b/i.test(item.name)) return item;
  const text = String(item.description || '');
  // Arrival offsets, opening windows and multi-activity durations are not this occurrence's length.
  if (/\b(?:before|after|doors?|arrival|each\s+of|sessions?\s+of)\b/i.test(text)) return item;
  const matches = [...text.matchAll(/\b(\d+(?:\.\d+)?|one|two|three|half)\s*[- ]?\s*(hours?|hrs?|minutes?|mins?)\b/gi)];
  if (matches.length !== 1) return item;
  const m = matches[0], words: Record<string, number> = {one:1,two:2,three:3,half:0.5};
  const amount = words[m[1].toLowerCase()] ?? Number(m[1]);
  const minutes = amount * (/^(?:hour|hr)/i.test(m[2]) ? 60 : 1);
  const bare = String(item.startTime || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  const start = printedClock(String(item.startTime || '')) ??
    (bare && +bare[1] <= 23 && +bare[2] < 60 ? +bare[1]*60 + +bare[2] : undefined);
  if (start === undefined || !Number.isInteger(minutes) || minutes < 15 || minutes > 720 ||
      !['explicit','implied'].includes(item.timeFlags?.start?.source || '')) return item;
  const endTime = hhmm((start + minutes) % 1440);
  const evidence = `Source duration: ${m[0]}; ${hhmm(start)} + ${minutes} minutes = ${endTime}`;
  return {...item, endTime, _sourceDurationResolution: {
    date: item.date, startTime: hhmm(start), endTime, minutes, evidence},
    timeFlags: {start: item.timeFlags!.start, end: {source:'implied', toClose:false, evidence}}};
}

export function hasProvenSourceDurationEnd(event: {startTime?: string; endTime?: string; timeFlags?: unknown}): boolean {
  const evidence = String((event.timeFlags as any)?.end?.evidence || '');
  const proof = evidence.match(/^Source duration: .+; (\d{2}:\d{2}) \+ (\d+) minutes = (\d{2}:\d{2})$/);
  if (!proof || proof[1] !== event.startTime || proof[3] !== event.endTime) return false;
  const [h,m] = proof[1].split(':').map(Number), minutes = Number(proof[2]);
  return h < 24 && m < 60 && minutes >= 15 && minutes <= 720 && hhmm((h*60+m+minutes)%1440) === proof[3];
}

function printedClock(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (!m || +m[1] < 1 || +m[1] > 12 || +(m[2] || 0) > 59) return undefined;
  return (+m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + +(m[2] || 0);
}

function bareClockCandidates(raw: string): number[] {
  const m = raw.trim().match(/^(\d{1,2})(?::|\s*h\s*)(\d{2})$/i);
  if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] > 59) return [];
  return [(+m[1] % 12) * 60 + +m[2], (+m[1] % 12 + 12) * 60 + +m[2]];
}

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Resolve only a unique range bracketed by printed clocks in the same calendar day/image. */
function resolveCalendarRange(items: ExtractedItem[], item: ExtractedItem): ExtractedItem {
  if (!hasUnresolvedSourceMeridiem(item) ||
      !['calendar', 'schedule'].includes(item._sourceType || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ||
      !Number.isInteger(item.relevantImageIndex) || item.relevantImageIndex! < 0) return item;
  const group = items.filter(x => x.date === item.date &&
    x.relevantImageIndex === item.relevantImageIndex && x._sourceType === item._sourceType);
  const position = group.indexOf(item);
  const anchors = group.map((x, index) => ({index, item: x,
    minute: x.timeFlags?.start?.source && x.timeFlags.start.source !== 'explicit'
      ? undefined : printedClock(String(x.startTime || ''))})).filter(x => x.minute !== undefined);
  if (anchors.some((x, index) => index > 0 && x.minute! <= anchors[index - 1].minute!)) return item;
  const before = anchors.filter(x => x.index < position).at(-1);
  const after = anchors.find(x => x.index > position);
  if (!before || !after) return item;
  const ranges = bareClockCandidates(String(item.startTime || '')).flatMap(start =>
    bareClockCandidates(String(item.endTime || '')).map(end => ({start, end})))
    .filter(({start, end}) => start >= before.minute! && end > start && end <= after.minute!);
  if (ranges.length !== 1) return item;
  const {start, end} = ranges[0];
  const evidence = `${item.date}: printed range ${item.startTime}–${item.endTime} falls between ` +
    `${before.item.startTime} (${before.item.name}) and ${after.item.startTime} (${after.item.name}) ` +
    'in the same calendar day/image; meridiem inferred from chronological context';
  const next = {...item, startTime: hhmm(start), endTime: hhmm(end),
    _sourceMeridiemResolution: {date: item.date, startTime: hhmm(start), endTime: hhmm(end), evidence},
    timeFlags: {start: {source: 'implied' as const, evidence},
      end: {source: 'implied' as const, toClose: false, evidence}}};
  if (next._sourceTimeConstraint?.reason === 'unresolved_meridiem') delete next._sourceTimeConstraint;
  return next;
}

/** Preserve an explicit unknown before formatting can normalize a bare 12-hour clock. */
export function hasUnresolvedSourceMeridiem(item?: Partial<ExtractedItem>): boolean {
  if (!item) return false;
  const clock = String(item.startTime || '').trim();
  if (!/^0?[1-8](?::\d{2}|\s*h\s*\d{2})/i.test(clock) ||
      /\d\s*[ap]\.?\s*m\.?\s*$/i.test(clock)) return false;
  const evidence = `${item.description || ''} ${item.extractionReason || ''} ${clock}`;
  return /(?:meridiem|am\s*\/\s*pm).{0,35}(?:unspecified|unknown|ambiguous|not\s+(?:printed|shown|stated|specified))|(?:does\s+not\s+specify|without|no\s+printed).{0,20}(?:a\.?m\.?\s*(?:or|\/)\s*p\.?m\.?|meridiem)|times?\s+(?:are\s+)?(?:left\s+)?ambiguous/i.test(evidence);
}

/** No clock is invented here. Item-local evidence wins over a shared meal caption. */
export function constrainSourceTimes(items: ExtractedItem[], caption: string): ExtractedItem[] {
  items = reconcileSourceItemEvidence(items, caption);
  const captionOnly = caption.split(/\n\s*OCR TEXT:/i)[0];
  const sharedMeals = captionOnly.match(/\b(?:breakfast|brunch|lunch|dinner|supper)\b/gi) || [];
  const oneSharedMeal = new Set(sharedMeals.map(x => x.toLowerCase())).size === 1
    ? sharedMeals[0] : '';
  return items.map(original => {
    const range = resolveCalendarRange(items, original);
    if (hasUnresolvedSourceMeridiem(range)) return {...range,
      _sourceTimeConstraint:{reason:'unresolved_meridiem',evidence:range.extractionReason || range.description || ''}};
    const normalized = {...range,
      startTime: hasSourceClock(range.startTime) ? range.startTime : '',
      endTime: hasSourceClock(range.endTime) ? String(range.endTime) : ''};
    const item = resolveSourceDuration(normalized);
    if (item._sourceTimeConstraint?.reason === 'doors_without_showtime') return item;
    if (hasUnresolvedSourceMeridiem(item)) return {...item,
      _sourceTimeConstraint: {reason: 'unresolved_meridiem', evidence: item.extractionReason || item.description || ''}};
    if (String(item.startTime || '').trim()) return item;
    if (['route','multi_location','online'].includes(String(item.spatial?.kind || ''))) return {...item,
      _sourceTimeConstraint:{reason:'dated_activity_without_clock',evidence:'Spatial activity has no advertised start clock; one venue or post timestamp cannot supply it'}};
    const detail = `${item.name} ${item.description || ''} ${item.extractionReason || ''}`;
    const diningService = /\b(?:dinner|supper|lunch|breakfast|brunch)\s+(?:service|special|served|offer|buffet)\b|\b(?:harvest\s+feast|prix\s*fixe)\b/i.test(detail) &&
      !/\b(?:concert|band|music|show|theatre|theater|fundrais(?:er|ing)|community\s+(?:meal|dinner))\b/i.test(item.name);
    const special = item._sourceType === 'special' || ('type' in item && item.type === 'special') || diningService;
    if (!special) return (item as any)._stage4NeedsTimeEnrichment === true ? {...item,
      _sourceTimeConstraint:{reason:'dated_activity_without_clock',evidence:'Validated dated activity has no advertised start clock'}} : item;
    if (/\b(?:all\s*day|open\s*to\s*close)\b/i.test(`${detail} ${item.timeFlags?.start?.evidence || ''}`)) return item;
    const meal = detail.match(/\b(?:breakfast|brunch|lunch|dinner|supper)\b/i)?.[0] ||
      (items.every(x => x._sourceType === 'special') ? oneSharedMeal : '');
    if (meal) return {...item, _sourceTimeConstraint: {
      reason: 'meal_period_without_clock', evidence: `${meal}: source gives no serving clock`}};
    // A mixed poster's untimed offer must not inherit the venue's whole day.
    const siblings = items.filter(x => x !== original && x._sourceType !== 'special' &&
      x.date === item.date && hasSourceClock(x.startTime) &&
      x.relevantImageIndex === item.relevantImageIndex);
    if (Number.isInteger(item.relevantImageIndex) && siblings.length) return {...item, _sourceTimeConstraint: {
      reason: 'activity_offer_without_clock', evidence: 'Untimed offer shares a dated image with a timed activity'}};
    return item;
  });
}

export function blocksStartTimeFallback(event: Pick<FormattedEvent, '_sourceTimeConstraint'>): boolean {
  return Boolean(event._sourceTimeConstraint);
}
