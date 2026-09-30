import { DateTime } from 'luxon';
import type { FormattedEvent, RecurringPattern } from './types.js';

const WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;
const WEEKLY_CUE = /\b(?:(?:every|each)\s+|weekly\s+(?:on\s+)?)(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i;
const TIME_CUE = /\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i;
const NAME_STOPWORDS = new Set(['the', 'with', 'and', 'at', 'night', 'nights', 'event', 'events']);
const GENERIC_SINGLE_WORDS = new Set(['craft', 'music', 'dance', 'class', 'workshop', 'trivia', 'party']);

export type CaptionWeeklyIssue = 'missing_item' | 'ambiguous_item' | 'anchor_mismatch' | 'cadence_conflict';

export interface CaptionWeeklyReconciliation {
  events: FormattedEvent[];
  issues: CaptionWeeklyIssue[];
  promotedCount: number;
}

function words(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

function titleMatchesClause(title: string, clause: string): boolean {
  const titleWords = words(title).filter((word) => !NAME_STOPWORDS.has(word));
  if (titleWords.length === 0) return false;
  const clauseWords = new Set(words(clause));
  const matches = titleWords.filter((word) => clauseWords.has(word));
  return matches.length >= 2 || (matches.length === 1 && titleWords.length === 1 &&
    matches[0].length >= 4 && !GENERIC_SINGLE_WORDS.has(matches[0]));
}

function firstOccurrence(postedAt: string, timezone: string, weekday: number, startTime: string): string {
  const posted = DateTime.fromISO(postedAt, { setZone: true }).setZone(timezone);
  if (!posted.isValid) return '';
  let first = posted.startOf('day').plus({ days: (weekday - posted.weekday + 7) % 7 });
  if (first.hasSame(posted, 'day')) {
    const match = String(startTime || '').match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const localStart = first.set({ hour: Number(match[1]), minute: Number(match[2]) });
      if (localStart <= posted) first = first.plus({ days: 7 });
    }
  }
  return first.toISODate() || '';
}

export function reconcileCaptionOnlyWeeklyEvents(input: {
  combinedText: string;
  postedAt: string;
  timezone: string;
  events: FormattedEvent[];
}): CaptionWeeklyReconciliation {
  const caption = String(input.combinedText || '')
    .split(/\bOCR TEXT\s*:/i)[0]
    .replace(/\b([ap])\.\s*m\./gi, '$1m');
  const clauses = caption.split(/[\n.!?…]+/).map((part) => part.trim()).filter(Boolean);
  const events = input.events.map((event) => ({ ...event }));
  const issues: CaptionWeeklyIssue[] = [];
  const claimed = new Set<number>();
  let promotedCount = 0;

  for (const clause of clauses) {
    const cue = clause.match(WEEKLY_CUE);
    if (!cue || !TIME_CUE.test(clause)) continue;
    const weekdayIndex = WEEKDAYS.indexOf(cue[1].toLowerCase() as typeof WEEKDAYS[number]);
    if (weekdayIndex < 0) continue;
    const pattern = `weekly_${WEEKDAYS[weekdayIndex]}` as RecurringPattern;
    const matches = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.relevantImageIndex === -1 && titleMatchesClause(event.name, clause));
    if (matches.length === 0) { issues.push('missing_item'); continue; }
    if (matches.length !== 1 || claimed.has(matches[0].index)) {
      issues.push('ambiguous_item');
      continue;
    }
    const { event, index } = matches[0];
    claimed.add(index);
    const expectedDate = firstOccurrence(input.postedAt, input.timezone, weekdayIndex + 1, event.startTime);
    if (!expectedDate || event.startDate !== expectedDate) {
      issues.push('anchor_mismatch');
      continue;
    }
    if (event.recurringPattern !== 'none' && event.recurringPattern !== pattern) {
      issues.push('cadence_conflict');
      continue;
    }
    event.recurringPattern = pattern;
    event.isRecurring = true;
    event.totalOccurrences = undefined;
    event.recurrenceUntilDate = undefined;
    promotedCount += 1;
  }

  return { events: issues.length > 0 ? input.events : events, issues, promotedCount: issues.length > 0 ? 0 : promotedCount };
}
