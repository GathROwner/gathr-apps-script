import type {ExtractedItem} from './types.js';

const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];

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
  const title = String(item.name || '');
  if (/\b(?:title\s+(?:not\s+(?:visible|shown)|unknown|unreadable)|(?:unknown|unidentified)\s+event)\b/i.test(title))
    return 'activity_identity_not_visible';
  if (/\bprivate\s+(?:rental|booking|event|party)\b/i.test(`${title} ${item.description || ''}`) &&
      !(/\b(?:available\s+(?:to|for)\s+(?:rent(?:al)?|book(?:ing)?)|book\s+(?:your|a)\s+private)\b/i.test(`${title} ${item.description || ''}`) &&
        !/\b(?:not\s+available|already\s+booked|fully\s+booked|occupied)\b/i.test(`${title} ${item.description || ''}`)))
    return 'private_occupied_slot';
  return undefined;
}

/** Item-local proofs only; never borrow another gallery cell's date, clock or venue. */
export function reconcileSourceItemEvidence(items: ExtractedItem[], caption: string): ExtractedItem[] {
  const reconciled = items.map(original => {
    let item = bindDatedTicketLink(original, caption);
    const text = `${item.description || ''} ${item.extractionReason || ''}`;
    const primaryCaption = caption.split(/\n\s*OCR TEXT:/i)[0];
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
