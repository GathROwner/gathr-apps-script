import type {ExtractedEvent, ExtractedItem} from './types.js';
import {sourcePublicationHoldReason,preserveCalendarClockPresence} from './sourcePublicationPolicy.js';

const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function explicitClock(value: string): string | undefined {
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (!m || +m[1] < 1 || +m[1] > 12 || +(m[2] || 0) > 59) return undefined;
  return `${String(+m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0)).padStart(2,'0')}:${String(+(m[2] || 0)).padStart(2,'0')}`;
}

/** One shared dinner/entertainment ticket must not give a meal the band's clock. */
export function bindSharedAdmissionEntertainment(items: ExtractedItem[], caption: string): ExtractedItem[] {
  if (items.length !== 1) return items;
  const item = items[0];
  if ('recurringPattern' in item && item.recurringPattern !== 'none') return items;
  const text = caption.split(/\n\s*OCR TEXT:/i)[0];
  if (!/\bdinner\s*(?:&|and)\s*entertainment\s*:/i.test(text)) return items;
  const headline = text.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.replace(/[!]+$/,'').trim() || '';
  if (!headline || headline.length > 90 || !/\b(?:party|gala|celebration|dinner[ -]dance)\b/i.test(headline)) return items;
  const normalizedName = String(item.name || '').trim().replace(/[!]+$/,'').trim();
  if (!/^(?:buffet\s+)?(?:dinner|supper|meal)$/i.test(normalizedName) &&
      normalizedName.toLowerCase() !== headline.toLowerCase()) return items;
  const dates = [...text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)];
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.date || '');
  if (!day || dates.length !== 1 || !months[+day[2]-1]?.startsWith(dates[0][1].toLowerCase()) || +day[3] !== +dates[0][2]) return items;
  const clock = '(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?\\s*m\\.?)';
  const mealClocks = [...text.matchAll(new RegExp('\\b(?:buffet\\s+)?(?:dinner|supper|meal)\\s+(?:(?:is|will\\s+be)\\s+)?(?:(?:served|serving|starts?)\\s+(?:(?:from|at)\\s+)?|from\\s+|at\\s+)' + clock, 'gi'))];
  if (mealClocks.some(m => explicitClock(m[1]) === item.startTime)) return items;
  const ranges = [...text.matchAll(new RegExp('\\blive\\s+(?:entertainment|music)\\s+by\\s+([^\\r\\n]{2,80}?)\\s+from\\s+' + clock + '\\s*[-–—]\\s*' + clock, 'gi'))];
  if (ranges.length !== 1) return items;
  const [, performer, start, end] = ranges[0];
  if (!/[a-z]/i.test(performer) || explicitClock(start) !== item.startTime || explicitClock(end) !== item.endTime) return items;
  const name = `${performer.trim()} — ${headline}`;
  const evidence = ranges[0][0];
  const normalized: ExtractedEvent = {...item, name, _sourceTitleResolution: name, _sourceType: 'event',
    date: item.date, startTime: explicitClock(start)!, endTime: explicitClock(end)!,
    venue: item.venue || '', price: String(item.price || ('pricing' in item ? item.pricing : '') || ''),
    recurringPattern: 'none', extractionReason: item.extractionReason || 'source_bound_shared_admission_entertainment',
    ...('type' in item ? {type: 'event' as const} : {}),
    description: `${String(item.description || '').trim()} Live entertainment by ${performer.trim()} runs ${start.trim()}–${end.trim()}. Dinner serving time is not supplied.`,
    timeFlags: {start: {source: 'explicit', evidence}, end: {source: 'explicit', toClose: false, evidence}}};
  // The same supplied amount is now ticket price, not a second food-special item.
  delete (normalized as unknown as Record<string,unknown>).pricing;
  return [normalized];
}

/** Restore a ticket URL only when its own block identifies the occurrence date. */
export function bindDatedTicketLink(item: ExtractedItem, caption: string): ExtractedItem {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.date || '');
  if (!date) return item;
  const month = months[Number(date[2])-1], day = Number(date[3]);
  if (!month) return item;
  const lines = caption.split(/\n/);
  const candidates: string[] = [];
  for (const line of lines) {
    const urls = line.match(/https?:\/\/[^\s<>"')]+/gi) || [];
    for (const raw of urls) {
      const url = raw.replace(/[.,;!?]+$/, '');
      // A generic homepage or an arbitrary link is not evidence of ticket identity.
      if (!/^https:\/\/(?:www\.)?(?:locarius\.io\/events\/|ticketpro\.(?:ca|com)\/)/i.test(url)) continue;
      const text = line.replace(/[-_]/g,' ');
      const dates = [...text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)];
      if (dates.length && dates.every(m => month.startsWith(m[1].toLowerCase()) && Number(m[2]) === day) &&
          !/\b20\d{2}\b/.test(text.replace(date[1],''))) candidates.push(url);
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) return item;
  const existing = String((item as any).ticketLink || '');
  if (existing && existing !== unique[0]) return item; // An explicit disagreement needs review.
  return {...item, ticketLink: unique[0]} as ExtractedItem;
}

export function sourceItemHoldReason(item: ExtractedItem): string | undefined {
  if ((item as any)._sourcePublicationHold) return String((item as any)._sourcePublicationHold);
  const identityText = `${item.description || ''} ${item.extractionReason || ''}`;
  if (['calendar','schedule'].includes(String(item._sourceType || '')) &&
      /\bdate\s+(?:digit\s+)?(?:is\s+)?(?:faint|unclear|obscured|partly\s+obscured)|\bdate\b.{0,35}\b(?:faint|partly\s+obscured|illegible)\b/i.test(identityText)) return 'calendar_date_identity_uncertain';
  if (['calendar','schedule'].includes(String(item._sourceType || '')) &&
      /\b(?:away\s+game|marked\s+away)\b/i.test(`${item.description || ''} ${item.spatial?.evidenceNotes || ''}`) &&
      !String(item.venue || '').trim() && !(Array.isArray(item.spatial?.locations) && item.spatial.locations.length)) return 'away_game_without_attendee_venue';
  if (item._sourceTimeConstraint?.reason === 'unresolved_meridiem') return 'source_meridiem_unresolved';
  if ((item as any)._sourceOccurrenceDateHold) return 'performance_run_requires_individual_occurrence_dates';
  const title = String(item.name || '');
  if (/^(?:we['’]?re|we\s+are)\s+looking\s+forward\b/i.test(title)) return 'activity_identity_not_visible';
  if (/\[[^\]]*\b(?:unclear|unreadable|unknown|illegible)\b[^\]]*\]|\btitle\s+(?:partly\s+)?(?:unclear|unreadable|illegible)\b/i.test(title))
    return 'activity_identity_not_visible';
  if (/\b(?:title\s+(?:not\s+(?:visible|shown)|unknown|unreadable)|(?:unknown|unidentified)\s+event)\b/i.test(title))
    return 'activity_identity_not_visible';
  if (/\bprivate\s+(?:rental|booking|event|party)\b/i.test(`${title} ${item.description || ''}`) &&
      !(/\b(?:available\s+(?:to|for)\s+(?:rent(?:al)?|book(?:ing)?)|book\s+(?:your|a)\s+private)\b/i.test(`${title} ${item.description || ''}`) &&
        !/\b(?:not\s+available|already\s+booked|fully\s+booked|occupied)\b/i.test(`${title} ${item.description || ''}`)))
    return 'private_occupied_slot';
  return undefined;
}

/** Repeated explicit transcription gaps mean adjacent cell identities are not
 * reliably verified either. Keep the whole dense schedule available for review. */
export function needsWholeScheduleIdentityReview(items: ExtractedItem[]): boolean {
  return items.length >= 5 && items.filter(item=>sourceItemHoldReason(item)==='activity_identity_not_visible').length >= 2;
}

/** Item-local proofs only; never borrow another gallery cell's date, clock or venue. */
export function reconcileSourceItemEvidence(items: ExtractedItem[], caption: string): ExtractedItem[] {
  items = bindSharedAdmissionEntertainment(items, caption);
  const reconciled = items.map(original => {
    let item = preserveCalendarClockPresence(bindDatedTicketLink(original, caption));
    const publicationHold = sourcePublicationHoldReason(item,caption);
    if(publicationHold)(item as any)._sourcePublicationHold=publicationHold;
    const text = `${item.description || ''} ${item.extractionReason || ''}`;
    const primaryCaption = caption.split(/\n\s*OCR TEXT:/i)[0];
    const fundraiserHeadings = primaryCaption.split(/\r?\n/).map(line=>line.replace(/^[^\p{L}\d]+/u,'').trim())
      .filter(line=>line.length<=100 && /\bfundraiser\s*!?$/i.test(line));
    const normalizedName = String(item.name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    const normalizedVenue = String(item.venue || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (normalizedName && normalizedName===normalizedVenue && fundraiserHeadings.length===1 &&
        /\b(?:dinner|supper|spaghetti|meal)\b/i.test(`${primaryCaption} ${text}`)) {
      item={...item,name:fundraiserHeadings[0],_sourceTitleResolution:fundraiserHeadings[0]};
    }
    // "Screening back to back with X" describes an adjacent screening, not the primary title.
    const adjacent = primaryCaption.match(/screening\s+back[ -]to[ -]back\s+with\s+(.+?)\s+on\b/i);
    if (adjacent && /\b(?:film|screening|cinema)\b/i.test(text) &&
        !/\b(?:double[ -]feature\s+(?:ticket|admission)|one\s+ticket|single\s+admission)\b/i.test(primaryCaption)) {
      const suffix = adjacent[1].trim();
      const at = item.name.toLowerCase().lastIndexOf(suffix.toLowerCase());
      if (at > 0) {
        const primary = item.name.slice(0,at).replace(/\s+(?:and|&|\+)\s*$/i,'').trim();
        if (primary && primaryCaption.slice(0,adjacent.index).toLowerCase().includes(primary.toLowerCase()))
          item = {...item,name:primary,_sourceTitleResolution:primary};
      }
    }
    if (/^walking\s+track\b/i.test(item.name) &&
        /\b(?:reopen|open).{0,70}(?:season|starting)|\bfor\s+the\s+season\b/i.test(text) &&
        /\bmonday\s*(?:to|through|[-–—])\s*friday\b/i.test(text) &&
        !/\b(?:only|one[ -]day|closed)\b/i.test(text)) {
      item = {...item, recurringPattern:'weekly_custom',
        recurringDaysOfWeek:['monday','tuesday','wednesday','thursday','friday']};
    }
    if ('recurringPattern' in item && item.recurringPattern === 'daily' &&
        /\b(?:dinner|supper|feast)\b/i.test(`${item.name} ${text}`) &&
        /\bdates?\b.{0,40}\d{1,2}\s*(?:&|and)\s*\d{1,2}\s*,/i.test(text) &&
        !/\b(?:every\s+day|daily)\b/i.test(text)) {
      item = {...item,recurringPattern:'none',totalOccurrences:undefined,recurrenceUntilDate:undefined};
    }
    const startEvidence = item.timeFlags?.start?.evidence || '';
    if (/\bdoors?\b/i.test(startEvidence) && !/\b(?:show(?:time)?|performance|starts?)\b/i.test(startEvidence)) {
      item = {...item, startTime:'', endTime:'',
        _sourceTimeConstraint:{reason:'doors_without_showtime',evidence:startEvidence},
        timeFlags:{start:{source:'none',evidence:`Only entry/doors time given: ${startEvidence}`},
          end:{source:'none',toClose:false,evidence:''}}};
    }
    return item;
  });
  const key = (item: ExtractedItem) => `${item.name.toLowerCase().replace(/[^a-z0-9]/g,'')}|${String(item.venue || '').toLowerCase().replace(/[^a-z0-9]/g,'')}`;
  const nameKey = (item: ExtractedItem) => item.name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return reconciled.map(item=>({...item,_sourceOccurrenceCount:Math.max(item._sourceOccurrenceCount || 0,
    reconciled.filter(other=>key(item)===key(other)).length,
    new Set(reconciled.filter(other=>nameKey(item)===nameKey(other)).map(other=>other.date)).size)}));
}
